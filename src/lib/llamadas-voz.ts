// Etiquetas y formato compartidos entre Agentes de Voz (tabla de historial)
// y Conversaciones (tarjeta de llamada inline) -- para que ambas vistas
// describan el mismo status/resultado exactamente igual.

export type StatusLlamadaVoz = "en_progreso" | "completada" | "fallida" | "sin_respuesta" | "buzon" | "rechazada" | "no_contesto";
export type ResultadoLlamadaVoz = "acepto" | "rechazo" | "pendiente";

export const ETIQUETA_STATUS_LLAMADA: Record<StatusLlamadaVoz, string> = {
  en_progreso: "En progreso",
  completada: "Completada",
  fallida: "Fallida",
  sin_respuesta: "Sin respuesta",
  buzon: "Buzón de voz",
  rechazada: "Rechazada",
  no_contesto: "No contestó",
};

export const ETIQUETA_RESULTADO_LLAMADA: Record<ResultadoLlamadaVoz, string> = {
  acepto: "Aceptó",
  rechazo: "Rechazó",
  pendiente: "Pendiente",
};

export function formatearDuracionLlamada(segundos: number | null): string {
  if (segundos === null) return "—";
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return `${min}:${seg.toString().padStart(2, "0")}`;
}
