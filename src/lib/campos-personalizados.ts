export type TipoCampo = "text" | "number" | "date" | "select" | "checkbox" | "email";

export type CampoPersonalizado = {
  id: string;
  cuenta_id: string;
  nombre: string;
  tipo: TipoCampo;
  requerido: boolean;
  orden: number;
  opciones: string[];
};

export const LABEL_TIPO: Record<TipoCampo, string> = {
  text: "Texto",
  number: "Número",
  date: "Fecha",
  select: "Lista (una opción)",
  checkbox: "Casillas (varias opciones)",
  email: "Correo",
};
