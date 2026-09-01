import { createAdminClient } from "@/lib/supabase/admin";
import type { CampoPersonalizado } from "@/lib/campos-personalizados";

type AdminClient = ReturnType<typeof createAdminClient>;

// Mismo patrón de resolución que ya usa enriquecerNotasCita en
// agente-acciones.ts (columnas reales vs. valores_campos_personalizados),
// pero indexado por clave_variable en vez de por prompt -- lo usa el envío de
// campañas para autollenar {{n}} desde el dato real del contacto cuando la
// plantilla tiene esa posición vinculada a una variable.
export async function obtenerValoresContactoPorClave(
  admin: AdminClient,
  cuentaId: string,
  contactoId: string,
  claves: string[],
): Promise<Record<string, string>> {
  const clavesUnicas = [...new Set(claves.filter(Boolean))];
  if (clavesUnicas.length === 0) return {};

  const [{ data: campos }, { data: contacto }, { data: valores }] = await Promise.all([
    admin.from("campos_personalizados").select("*").eq("cuenta_id", cuentaId).in("clave_variable", clavesUnicas),
    admin.from("contactos").select("nombre_completo, telefono, correo_electronico").eq("id", contactoId).maybeSingle(),
    admin.from("valores_campos_personalizados").select("campo_id, valor").eq("contacto_id", contactoId),
  ]);

  const valorPorCampoId: Record<string, string> = {};
  for (const v of valores ?? []) if (v.valor) valorPorCampoId[v.campo_id] = v.valor;

  const resultado: Record<string, string> = {};
  for (const campo of (campos ?? []) as CampoPersonalizado[]) {
    if (!campo.clave_variable) continue;
    const valor =
      campo.mapea_a_columna_real === "nombre_completo"
        ? contacto?.nombre_completo
        : campo.mapea_a_columna_real === "telefono"
          ? contacto?.telefono
          : campo.mapea_a_columna_real === "correo_electronico"
            ? contacto?.correo_electronico
            : valorPorCampoId[campo.id];
    if (valor) resultado[campo.clave_variable] = valor;
  }

  return resultado;
}

// Por cada posición {{n}} del body: si la plantilla la tiene ligada a una
// variable real (pestaña "Mensaje" del asistente de plantillas), se
// autollena con el dato de ESE contacto -- si no lo tiene capturado
// todavía, o la posición no está ligada a nada, se cae al valor que se haya
// dado manualmente (ej. al iniciar una campaña con valores fijos), y si
// tampoco hay eso, al ejemplo guardado en la plantilla (mejor un valor
// genérico que un {{n}} vacío en el mensaje real). Se usa tanto desde el
// cron de campañas como desde el envío individual de plantilla en
// Conversaciones.
export async function resolverParametrosPlantilla(
  admin: AdminClient,
  cuentaId: string,
  contactoId: string,
  template: { variables: string[] | null; variables_mapeo: (string | null)[] | null },
  valoresManuales: unknown = [],
): Promise<string[]> {
  const ejemplos = template.variables ?? [];
  const mapeo = template.variables_mapeo ?? [];
  const valoresDados = Array.isArray(valoresManuales) ? valoresManuales.map(String) : [];
  const totalPosiciones = Math.max(ejemplos.length, mapeo.length, valoresDados.length);

  const clavesUsadas = mapeo.filter((c): c is string => !!c);
  const valoresContacto = clavesUsadas.length > 0 ? await obtenerValoresContactoPorClave(admin, cuentaId, contactoId, clavesUsadas) : {};

  const parametros: string[] = [];
  for (let i = 0; i < totalPosiciones; i++) {
    const clave = mapeo[i];
    const valorContacto = clave ? valoresContacto[clave] : undefined;
    parametros.push(valorContacto ?? valoresDados[i] ?? ejemplos[i] ?? "");
  }
  return parametros;
}
