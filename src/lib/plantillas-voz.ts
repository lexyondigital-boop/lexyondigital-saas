// Catálogos compartidos entre Plantillas (lista de solo activar/desactivar)
// y Agentes de Voz (donde vive toda la configuración real).

import type { FuncionRetell } from "@/lib/retell";
import type { CampoPersonalizado, TipoCampo } from "@/lib/campos-personalizados";

export const AGENTES_TIPO_VOZ: { valor: string; etiqueta: string; disponible: boolean }[] = [
  { valor: "servicio", etiqueta: "Servicio", disponible: true },
  { valor: "citas", etiqueta: "Recordatorio de citas", disponible: true },
  { valor: "venta", etiqueta: "Venta", disponible: true },
  { valor: "cobranza", etiqueta: "Cobranza", disponible: true },
  { valor: "legal", etiqueta: "Legal", disponible: true },
];

export const CATEGORIAS_VOZ: { valor: string; etiqueta: string }[] = [
  { valor: "legal", etiqueta: "Legal" },
  { valor: "medicos", etiqueta: "Médicos" },
  { valor: "inmobiliario", etiqueta: "Inmobiliarios" },
  { valor: "servicios", etiqueta: "Servicios" },
  { valor: "cobranza", etiqueta: "Cobranza" },
  { valor: "ventas", etiqueta: "Ventas" },
];

export const IDIOMAS_VOZ: { valor: string; etiqueta: string }[] = [
  { valor: "es-419", etiqueta: "Español (Latinoamérica)" },
  { valor: "es-ES", etiqueta: "Español (España)" },
  { valor: "en-US", etiqueta: "Inglés (EE. UU.)" },
  { valor: "en-GB", etiqueta: "Inglés (Reino Unido)" },
  { valor: "pt-BR", etiqueta: "Portugués (Brasil)" },
  { valor: "fr-FR", etiqueta: "Francés" },
];

// "Configuración de llamadas" de Retell -- valores predefinidos en vez de un
// slider continuo (este código no tiene ningún <input type="range">, y los
// valores numéricos con pocas opciones sensatas siempre se resuelven con un
// <select>, igual que el intervalo mínimo entre llamadas).
export const OPCIONES_DTMF_TIMEOUT: { valor: number; etiqueta: string }[] = [
  { valor: 1000, etiqueta: "1 s" },
  { valor: 1500, etiqueta: "1.5 s" },
  { valor: 2000, etiqueta: "2 s" },
  { valor: 2500, etiqueta: "2.5 s" },
  { valor: 3000, etiqueta: "3 s" },
  { valor: 5000, etiqueta: "5 s" },
  { valor: 10000, etiqueta: "10 s" },
  { valor: 15000, etiqueta: "15 s" },
];

export const OPCIONES_DTMF_LIMITE_DIGITOS: { valor: number; etiqueta: string }[] = [1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({
  valor: n,
  etiqueta: `${n} dígito${n > 1 ? "s" : ""}`,
}));

export const OPCIONES_DTMF_CLAVE_TERMINACION: { valor: string; etiqueta: string }[] = [
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "#", "*",
].map((k) => ({ valor: k, etiqueta: k }));

export const OPCIONES_FIN_SILENCIO: { valor: number; etiqueta: string }[] = [
  { valor: 10000, etiqueta: "10 s" },
  { valor: 30000, etiqueta: "30 s" },
  { valor: 60000, etiqueta: "1 min" },
  { valor: 120000, etiqueta: "2 min" },
  { valor: 300000, etiqueta: "5 min" },
  { valor: 600000, etiqueta: "10 min" },
  { valor: 900000, etiqueta: "15 min" },
  { valor: 1200000, etiqueta: "20 min" },
];

export const OPCIONES_DURACION_MAXIMA: { valor: number; etiqueta: string }[] = [5, 10, 15, 20, 30, 45, 60, 90, 120].map((min) => ({
  valor: min * 60000,
  etiqueta: `${min} min`,
}));

export const OPCIONES_DURACION_ANILLO: { valor: number; etiqueta: string }[] = [10, 15, 20, 30, 45, 60, 90, 120].map((seg) => ({
  valor: seg * 1000,
  etiqueta: `${seg} s`,
}));

// Rango real de Retell para transfer_ring_duration_ms (5-90 s) -- distinto
// del timbre de la llamada completa (ring_duration_ms, arriba).
export const OPCIONES_DURACION_ANILLO_TRANSFERENCIA: { valor: number; etiqueta: string }[] = [
  5, 10, 15, 20, 30, 45, 60, 75, 90,
].map((seg) => ({ valor: seg * 1000, etiqueta: `${seg} s` }));

export const OPCIONES_ON_HOLD_MUSIC: { valor: "none" | "relaxing_sound" | "uplifting_beats" | "ringtone"; etiqueta: string }[] = [
  { valor: "none", etiqueta: "Sin música" },
  { valor: "relaxing_sound", etiqueta: "Relajante" },
  { valor: "uplifting_beats", etiqueta: "Animada" },
  { valor: "ringtone", etiqueta: "Tono de timbre" },
];

// Rango real de Retell para transfer_timeout_ms en transferencia agencial
// (10 s - 5 min).
export const OPCIONES_TRANSFER_TIMEOUT_AGENCIAL: { valor: number; etiqueta: string }[] = [
  10, 15, 20, 30, 45, 60, 90, 120, 180, 300,
].map((seg) => ({ valor: seg * 1000, etiqueta: seg < 60 ? `${seg} s` : `${Math.round(seg / 60)} min` }));

const CLAVES_TERMINACION_DTMF = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "#", "*"] as const;

// Rangos que documenta Retell para "Configuración de llamadas" -- se valida
// aquí antes de mandarlo, en vez de dejar que Retell responda un 400 crudo.
export function validarConfiguracionLlamada(body: {
  retell_dtmf_timeout_ms?: number;
  retell_dtmf_clave_terminacion?: string | null;
  retell_dtmf_limite_digitos?: number | null;
  retell_fin_silencio_ms?: number;
  retell_duracion_maxima_ms?: number;
  retell_duracion_anillo_ms?: number;
}): string | null {
  if (body.retell_dtmf_timeout_ms !== undefined && (body.retell_dtmf_timeout_ms < 1000 || body.retell_dtmf_timeout_ms > 15000)) {
    return "El tiempo de espera del teclado debe estar entre 1 y 15 segundos";
  }
  if (
    body.retell_dtmf_clave_terminacion &&
    !CLAVES_TERMINACION_DTMF.includes(body.retell_dtmf_clave_terminacion as (typeof CLAVES_TERMINACION_DTMF)[number])
  ) {
    return "Clave de terminación inválida";
  }
  if (body.retell_dtmf_limite_digitos !== undefined && body.retell_dtmf_limite_digitos !== null) {
    if (body.retell_dtmf_limite_digitos < 1 || body.retell_dtmf_limite_digitos > 50) return "El límite de dígitos debe estar entre 1 y 50";
  }
  if (body.retell_fin_silencio_ms !== undefined && body.retell_fin_silencio_ms < 10000) {
    return "El fin de llamada por silencio debe ser de al menos 10 segundos";
  }
  if (body.retell_duracion_maxima_ms !== undefined && (body.retell_duracion_maxima_ms < 60000 || body.retell_duracion_maxima_ms > 7200000)) {
    return "La duración máxima de la llamada debe estar entre 1 minuto y 2 horas";
  }
  if (body.retell_duracion_anillo_ms !== undefined && (body.retell_duracion_anillo_ms < 5000 || body.retell_duracion_anillo_ms > 300000)) {
    return "La duración del timbre debe estar entre 5 y 300 segundos";
  }
  return null;
}

// Valida una función transfer_call antes de mandarla a Retell (que
// respondería un 400 crudo si algo viene fuera de rango o incompleto).
export function validarFuncionTransferCall(f: FuncionRetell): string | null {
  if (f.type !== "transfer_call") return null;

  if (f.transfer_destination?.type === "predefined" && !f.transfer_destination.number?.trim()) {
    return "Falta el número de destino de la transferencia";
  }

  const opcion = f.transfer_option;
  if (opcion?.type === "cold_transfer" || opcion?.type === "warm_transfer") {
    if (
      opcion.transfer_ring_duration_ms !== undefined &&
      (opcion.transfer_ring_duration_ms < 5000 || opcion.transfer_ring_duration_ms > 90000)
    ) {
      return "La duración del timbre de la transferencia debe estar entre 5 y 90 segundos";
    }
  }
  if (opcion?.type === "agentic_warm_transfer") {
    if (!opcion.agentic_transfer_config?.transfer_agent?.agent_id) {
      return "Falta elegir el agente destino de la transferencia agencial";
    }
    const timeout = opcion.agentic_transfer_config.transfer_timeout_ms;
    if (timeout !== undefined && (timeout < 10000 || timeout > 300000)) {
      return "El tiempo de espera de la transferencia agencial debe estar entre 10 segundos y 5 minutos";
    }
  }
  if (f.speak_during_execution && !f.execution_message_description?.trim()) {
    return "Falta el mensaje para \"Habla mientras esperas\"";
  }
  return null;
}

// Tipos de Variables que Retell puede extraer con extract_dynamic_variable
// -- no tiene un tipo multi-selección, así que "checkbox" queda fuera.
const TIPO_RETELL: Partial<Record<TipoCampo, "string" | "number" | "enum">> = {
  text: "string",
  phone: "string",
  email: "string",
  date: "string",
  number: "number",
  select: "enum",
};

// Arma la función extract_dynamic_variable de Retell a partir de las
// Variables que el admin marcó como "a capturar" en este agente de voz --
// análogo a construirHerramientaGuardarDatos (agente-prompt-variables.ts)
// pero con el shape que espera Retell en vez del de nuestras Herramienta de
// WhatsApp.
export function construirHerramientaExtraerVariablesRetell(campos: CampoPersonalizado[]): FuncionRetell | null {
  const capturables = campos.filter((c) => c.clave_variable && TIPO_RETELL[c.tipo]);
  if (capturables.length === 0) return null;

  return {
    type: "extract_dynamic_variable",
    name: "extraer_datos_llamada",
    description: "Extrae datos que el cliente confirme o proporcione durante la llamada.",
    variables: capturables.map((c) => ({
      name: c.clave_variable as string,
      type: TIPO_RETELL[c.tipo]!,
      description: c.nombre,
      ...(c.tipo === "select" ? { choices: c.opciones } : {}),
      required: c.requerido,
    })),
  };
}

const ETIQUETA_TIPO_VOZ: Record<TipoCampo, string> = {
  text: "texto",
  number: "número",
  date: "fecha",
  select: "opción",
  checkbox: "casillas",
  email: "correo",
  phone: "teléfono",
};

// Bloque de instrucción para el Copyscript -- mismo espíritu que
// construirBloqueVariables (agente-prompt-variables.ts) pero fraseado para
// una llamada en vivo: aquí no se le dice al modelo el nombre de ninguna
// herramienta (Retell decide solo cuándo llamar extract_dynamic_variable).
export function construirBloqueVariablesVoz(campos: CampoPersonalizado[]): string | null {
  const capturables = campos.filter((c) => c.clave_variable && TIPO_RETELL[c.tipo]);
  if (capturables.length === 0) return null;

  const lineas = capturables.map(
    (c) => `- ${c.clave_variable} (${ETIQUETA_TIPO_VOZ[c.tipo]}${c.requerido ? ", obligatorio" : ""}) — ${c.nombre}`,
  );

  return `DATOS A CONFIRMAR EN ESTA LLAMADA (pregunta y confirma verbalmente con el cliente cada uno de estos datos antes de colgar):\n${lineas.join("\n")}`;
}
