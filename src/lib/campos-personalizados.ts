export type TipoCampo = "text" | "number" | "date" | "select" | "checkbox" | "email" | "phone";

export type CampoPersonalizado = {
  id: string;
  cuenta_id: string;
  nombre: string;
  tipo: TipoCampo;
  requerido: boolean;
  orden: number;
  opciones: string[];
  clave_variable: string | null;
  mapea_a_columna_real: "nombre_completo" | null;
};

export const LABEL_TIPO: Record<TipoCampo, string> = {
  text: "Texto",
  number: "Número",
  date: "Fecha",
  select: "Lista (una opción)",
  checkbox: "Casillas (varias opciones)",
  email: "Correo",
  phone: "Teléfono",
};

const DIACRITICOS = new RegExp("[̀-ͯ]", "g");

// Sugerencia automática de clave a partir del nombre libre del campo (ej.
// "Teléfono de contacto" -> "telefono_de_contacto") -- el admin la puede
// editar a mano después.
export function slugificarClaveVariable(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
