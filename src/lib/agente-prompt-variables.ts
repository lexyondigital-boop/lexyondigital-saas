import type { CampoPersonalizado, TipoCampo } from "@/lib/campos-personalizados";
import type { Herramienta } from "@/lib/ia";

// Formateo/detección puros (sin acceso a base de datos) para el flujo de
// "variables" que el admin usa como {{marcador}} dentro del prompt del
// Agente IA. Vive aparte de agente-acciones.ts (server-only, cliente admin)
// para poder importarlo también desde la pantalla de Agente IA y mostrar ahí
// mismo qué variables detectó y cuáles faltan por definir.

const REGEX_VARIABLE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

// Todas las {{claves}} que aparecen en el prompt, en el orden en que el
// admin las escribió (el orden importa: el agente debe seguirlo).
export function detectarClavesEnPrompt(prompt: string): string[] {
  const encontradas: string[] = [];
  let m: RegExpExecArray | null;
  const regex = new RegExp(REGEX_VARIABLE);
  while ((m = regex.exec(prompt))) {
    if (!encontradas.includes(m[1])) encontradas.push(m[1]);
  }
  return encontradas;
}

export function resolverVariablesDelPrompt(
  prompt: string,
  campos: CampoPersonalizado[],
): { usadas: CampoPersonalizado[]; noDefinidas: string[] } {
  const claves = detectarClavesEnPrompt(prompt);
  const porClave = new Map(campos.filter((c) => c.clave_variable).map((c) => [c.clave_variable as string, c]));
  const usadas: CampoPersonalizado[] = [];
  const noDefinidas: string[] = [];
  for (const clave of claves) {
    const campo = porClave.get(clave);
    if (campo) usadas.push(campo);
    else noDefinidas.push(clave);
  }
  return { usadas, noDefinidas };
}

const ETIQUETA_TIPO: Record<TipoCampo, string> = {
  text: "texto",
  number: "número",
  date: "fecha",
  select: "opción",
  checkbox: "casillas",
  email: "correo",
  phone: "teléfono",
};

// El teléfono nunca se pide ni se captura -- ya se conoce desde que el
// cliente escribe por WhatsApp (es la llave de enrutamiento real de los
// mensajes). Se excluye tanto de lo que el agente debe preguntar como de la
// herramienta que puede escribir, para que nunca lo sobrescriba por error.
function esCapturable(c: CampoPersonalizado): boolean {
  return c.mapea_a_columna_real !== "telefono";
}

export function construirBloqueVariables(usadas: CampoPersonalizado[]): string | null {
  const capturables = usadas.filter(esCapturable);
  if (capturables.length === 0) return null;

  const lineas = capturables.map(
    (c) => `- ${c.clave_variable} (${ETIQUETA_TIPO[c.tipo]}${c.requerido ? ", obligatorio" : ""}) — ${c.nombre}`,
  );

  return `DATOS A RECOPILAR (usa la herramienta guardar_datos_contacto con estas claves exactas apenas obtengas cada dato -- no esperes a tener todos, y no preguntes por datos que no estén en esta lista):\n${lineas.join("\n")}`;
}

export function construirHerramientaGuardarDatos(usadas: CampoPersonalizado[]): Herramienta | null {
  const capturables = usadas.filter(esCapturable);
  if (capturables.length === 0) return null;

  const properties: Record<string, unknown> = {};
  for (const c of capturables) {
    properties[c.clave_variable as string] = {
      type: c.tipo === "number" ? "number" : "string",
      description: c.nombre,
    };
  }

  return {
    nombre: "guardar_datos_contacto",
    descripcion:
      "Guarda o actualiza los datos del cliente que ya hayas obtenido en la conversación. Llámala cada vez que consigas un dato nuevo o corregido -- no esperes a tener todos. Incluye solo los campos que el cliente ya confirmó.",
    parametros: { type: "object", properties },
  };
}

// Valida el formato de un valor recién extraído antes de guardarlo. Devuelve
// un mensaje de error (para que el agente pueda volver a pedir el dato) o
// null si es válido.
export function validarValorVariable(tipo: TipoCampo, valorCrudo: unknown): string | null {
  const texto = String(valorCrudo ?? "").trim();
  if (!texto) return "el valor viene vacío";
  if (tipo === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) return "no tiene formato de correo válido";
  if (tipo === "phone" && texto.replace(/\D/g, "").length < 8) return "no tiene formato de teléfono válido";
  if (tipo === "number" && !Number.isFinite(Number(texto))) return "no es un número";
  if (tipo === "date" && Number.isNaN(Date.parse(texto))) return "no tiene formato de fecha válido";
  return null;
}

// Texto "Etiqueta: valor" por cada variable con dato capturado -- se usa
// tanto para las notas de la cita como para la descripción del evento en
// Google Calendar, así los dos quedan siempre iguales.
export function formatearDatosParaNotas(
  usadas: CampoPersonalizado[],
  contacto: { nombre_completo: string | null; telefono: string | null; correo_electronico: string | null },
  valoresPorCampoId: Record<string, string>,
): string {
  const lineas: string[] = [];
  for (const c of usadas) {
    const valor =
      c.mapea_a_columna_real === "nombre_completo"
        ? contacto.nombre_completo
        : c.mapea_a_columna_real === "telefono"
          ? contacto.telefono
          : c.mapea_a_columna_real === "correo_electronico"
            ? contacto.correo_electronico
            : valoresPorCampoId[c.id];
    if (valor) lineas.push(`${c.nombre}: ${valor}`);
  }
  return lineas.join("\n");
}
