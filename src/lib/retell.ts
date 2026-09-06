import { createAdminClient } from "@/lib/supabase/admin";
import { descifrar } from "@/lib/cifrado";
import { normalizarDestinatario } from "@/lib/meta";

type AdminClient = ReturnType<typeof createAdminClient>;

// Valida la API key contra Retell ANTES de guardar nada -- así no se
// arriesga a dejar guardada una key que no sirve.
export async function validarApiKeyRetell(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.retellai.com/v2/list-agents", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });
    if (res.status === 401) return { ok: false, error: "La API key no es válida" };
    if (!res.ok) return { ok: false, error: `Retell respondió con un error (${res.status})` };
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo conectar con Retell" };
  }
}

export type NumeroRetell = { phone_number: string; phone_number_pretty: string | null; nickname: string | null };

// GET /v2/list-phone-numbers -- números ya comprados/importados en esa
// cuenta de Retell, para elegir cuál usar como saliente (from_number) en
// vez de que el cliente lo tenga que copiar/pegar a mano.
export async function listarNumerosRetell(apiKey: string): Promise<{ ok: true; numeros: NumeroRetell[] } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.retellai.com/v2/list-phone-numbers", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401) return { ok: false, error: "La API key no es válida" };
    if (!res.ok) return { ok: false, error: `Retell respondió con un error (${res.status})` };
    const data = await res.json();
    const items = (data.items ?? []) as Array<{ phone_number: string; phone_number_pretty?: string; nickname?: string }>;
    return {
      ok: true,
      numeros: items.map((n) => ({ phone_number: n.phone_number, phone_number_pretty: n.phone_number_pretty ?? null, nickname: n.nickname ?? null })),
    };
  } catch {
    return { ok: false, error: "No se pudo conectar con Retell" };
  }
}

// POST /v2/create-phone-call -- dispara una llamada saliente real.
export async function crearLlamadaRetell(
  apiKey: string,
  params: { fromNumber: string; toNumber: string; metadata?: Record<string, unknown>; dynamicVariables?: Record<string, string> },
): Promise<{ ok: true; callId: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.retellai.com/v2/create-phone-call", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from_number: params.fromNumber,
        to_number: params.toNumber,
        metadata: params.metadata,
        retell_llm_dynamic_variables: params.dynamicVariables,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: (data as { message?: string }).message ?? `Retell respondió con un error (${res.status})` };
    }
    const data = (await res.json()) as { call_id: string };
    return { ok: true, callId: data.call_id };
  } catch {
    return { ok: false, error: "No se pudo conectar con Retell" };
  }
}

// La key maestra de lexyondigital vive en plataforma_secretos (misma tabla
// que las de OpenAI/Anthropic) -- se resuelve aparte de
// resolverLlaveDePlataforma() porque esa función está tipada a ProveedorIA.
export async function resolverLlaveMaestraRetell(admin: AdminClient): Promise<string | null> {
  const { data } = await admin.from("plataforma_secretos").select("valor_cifrado").eq("clave", "retell_api_key").maybeSingle();
  return data?.valor_cifrado ? descifrar(data.valor_cifrado) : null;
}

// Resuelve qué API key de Retell usar para una cuenta: la suya propia si
// eligió modo 'propia', o la maestra de lexyondigital si eligió 'master'.
export async function resolverApiKeyRetell(admin: AdminClient, cuentaId: string): Promise<string | null> {
  const { data } = await admin
    .from("cuentas_retell")
    .select("modo, api_key_cifrada")
    .eq("cuenta_id", cuentaId)
    .eq("activo", true)
    .maybeSingle();

  if (!data) return null;
  if (data.modo === "propia") return data.api_key_cifrada ? descifrar(data.api_key_cifrada) : null;
  return resolverLlaveMaestraRetell(admin);
}

// Junta todo lo que hace falta para disparar una llamada: la API key
// correcta según el modo de la cuenta, y el número saliente ya elegido --
// con mensajes de error claros para cada cosa que pueda faltar, en vez de
// un null genérico.
export async function resolverCuentaRetell(
  admin: AdminClient,
  cuentaId: string,
): Promise<{ apiKey: string; numeroSaliente: string } | { error: string }> {
  const { data } = await admin
    .from("cuentas_retell")
    .select("modo, api_key_cifrada, numero_saliente")
    .eq("cuenta_id", cuentaId)
    .eq("activo", true)
    .maybeSingle();

  if (!data) return { error: "Esta cuenta no tiene Retell conectado" };
  if (!data.numero_saliente) return { error: "Falta elegir el número saliente de Retell en Configuración → Integraciones" };

  const apiKey = data.modo === "propia" ? (data.api_key_cifrada ? descifrar(data.api_key_cifrada) : null) : await resolverLlaveMaestraRetell(admin);
  if (!apiKey) return { error: "No se pudo resolver la API key de Retell de esta cuenta" };

  return { apiKey, numeroSaliente: data.numero_saliente };
}

// contactos.telefono guarda el mismo formato que el wa_id de WhatsApp (sin
// "+"); normalizarDestinatario ya sabe convertirlo al formato de envío real
// -- para Retell (E.164) solo hace falta anteponer el "+".
export function telefonoAE164(telefono: string): string {
  return `+${normalizarDestinatario(telefono)}`;
}

const DESCONEXION_SIN_RESPUESTA = new Set([
  "dial_no_answer",
  "dial_busy",
  "voicemail_reached",
  "ivr_reached",
  "inactivity",
  "registered_call_timeout",
]);

const DESCONEXION_FALLIDA = new Set([
  "dial_failed",
  "invalid_destination",
  "telephony_provider_permission_denied",
  "telephony_provider_unavailable",
  "sip_routing_error",
  "no_valid_payment",
  "concurrency_limit_reached",
  "no_concurrency_fallback",
  "scam_detected",
  "marked_as_spam",
]);

// Retell no tiene un status "aceptó/rechazó/no contestó" -- lo inferimos de
// call_status + disconnection_reason. El resto de motivos (colgó el usuario o
// el agente, transferencia, límite de duración, etc.) sí fue una llamada real.
export function mapearStatusLlamada(
  callStatus: string,
  disconnectionReason?: string | null,
): "completada" | "fallida" | "sin_respuesta" {
  if (callStatus === "error") return "fallida";
  if (disconnectionReason && DESCONEXION_SIN_RESPUESTA.has(disconnectionReason)) return "sin_respuesta";
  if (disconnectionReason && (DESCONEXION_FALLIDA.has(disconnectionReason) || disconnectionReason.startsWith("error_"))) {
    return "fallida";
  }
  return "completada";
}

// call_analysis solo llega con el evento call_analyzed (después de
// call_ended) -- call_successful es lo más cercano a "aceptó/rechazó" que
// ofrece Retell sin depender de un esquema de análisis propio por agente.
export function mapearResultadoLlamada(callAnalysis?: { call_successful?: boolean } | null): "acepto" | "rechazo" | "pendiente" {
  if (!callAnalysis || callAnalysis.call_successful === undefined) return "pendiente";
  return callAnalysis.call_successful ? "acepto" : "rechazo";
}
