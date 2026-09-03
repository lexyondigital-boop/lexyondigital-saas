import Papa from "papaparse";
import type { CampoPersonalizado } from "@/lib/campos-personalizados";
import { normalizarTelefonoImportado, type PaisImportacion } from "@/lib/telefono-import";

// Columnas fijas del CSV -- "Canal" no aparece aquí a propósito: el origen
// de un contacto importado por campaña se autocompleta como "campaña" (ver
// procesarFilaCsv), no lo captura el usuario. "Nombre" (el de WhatsApp)
// tampoco aparece: se autocaptura del perfil cuando el contacto escribe.
const COLUMNAS_FIJAS = [
  { header: "Teléfono", clave: "telefono", requerida: true },
  { header: "Nombre completo", clave: "nombre_completo", requerida: false },
  { header: "Correo electrónico", clave: "correo_electronico", requerida: false },
  { header: "Etiquetas", clave: "etiquetas", requerida: false },
] as const;

export type ColumnaCsv =
  | { header: string; tipo: "fija"; clave: "telefono" | "nombre_completo" | "correo_electronico" | "etiquetas"; requerida: boolean }
  | { header: string; tipo: "personalizada"; campoId: string; requerida: boolean };

export function resolverColumnasCsv(camposPersonalizados: CampoPersonalizado[]): ColumnaCsv[] {
  return [
    ...COLUMNAS_FIJAS.map((c) => ({ header: c.header, tipo: "fija" as const, clave: c.clave, requerida: c.requerida })),
    ...camposPersonalizados
      .filter((c) => !c.es_fijo)
      .map((c) => ({ header: c.nombre, tipo: "personalizada" as const, campoId: c.id, requerida: c.requerido })),
  ];
}

export function generarCsvPlantilla(columnas: ColumnaCsv[]): string {
  const headers = columnas.map((c) => c.header);
  // La columna de Etiquetas se deja vacía a propósito: es opcional, y un
  // valor de ejemplo aquí se subiría como etiqueta real si el usuario
  // olvida borrarlo al llenar su CSV.
  const ejemplo = columnas.map((c) => {
    if (c.tipo === "fija" && c.clave === "telefono") return "9811234567";
    return "";
  });
  return Papa.unparse({ fields: headers, data: [ejemplo] });
}

export type FilaProcesada = {
  numeroFila: number;
  ok: boolean;
  motivo?: string;
  telefono?: string;
  camposReales?: { nombre_completo?: string; correo_electronico?: string; etiquetas?: string[] };
  valoresPersonalizados?: { campo_id: string; valor: string }[];
};

// Matchea cada encabezado del CSV subido contra las columnas resueltas para
// esta cuenta (case-insensitive/trim) -- un encabezado que no matchea se
// reporta como ignorado en vez de tronar el import completo.
export function matchearEncabezados(
  encabezadosCsv: string[],
  columnas: ColumnaCsv[],
): { porIndice: (ColumnaCsv | null)[]; ignorados: string[] } {
  const normalizar = (s: string) => s.trim().toLowerCase();
  const porIndice: (ColumnaCsv | null)[] = [];
  const ignorados: string[] = [];

  for (const encabezado of encabezadosCsv) {
    const columna = columnas.find((c) => normalizar(c.header) === normalizar(encabezado));
    porIndice.push(columna ?? null);
    if (!columna) ignorados.push(encabezado);
  }

  return { porIndice, ignorados };
}

export function procesarFilaCsv(
  numeroFila: number,
  fila: string[],
  porIndice: (ColumnaCsv | null)[],
  pais: PaisImportacion,
): FilaProcesada {
  let telefonoCrudo: string | null = null;
  const camposReales: FilaProcesada["camposReales"] = {};
  const valoresPersonalizados: { campo_id: string; valor: string }[] = [];

  for (let i = 0; i < fila.length; i++) {
    const columna = porIndice[i];
    const valor = fila[i]?.trim();
    if (!columna || !valor) continue;

    if (columna.tipo === "fija") {
      if (columna.clave === "telefono") telefonoCrudo = valor;
      else if (columna.clave === "nombre_completo") camposReales.nombre_completo = valor;
      else if (columna.clave === "correo_electronico") camposReales.correo_electronico = valor;
      else if (columna.clave === "etiquetas") camposReales.etiquetas = valor.split(";").map((e) => e.trim()).filter(Boolean);
    } else {
      valoresPersonalizados.push({ campo_id: columna.campoId, valor });
    }
  }

  if (!telefonoCrudo) {
    return { numeroFila, ok: false, motivo: "Falta el teléfono" };
  }

  const normalizado = normalizarTelefonoImportado(telefonoCrudo, pais);
  if (!normalizado.ok) {
    return { numeroFila, ok: false, motivo: normalizado.error };
  }

  return { numeroFila, ok: true, telefono: normalizado.telefono, camposReales, valoresPersonalizados };
}
