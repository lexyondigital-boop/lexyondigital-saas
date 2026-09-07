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
  params: {
    fromNumber: string;
    toNumber: string;
    metadata?: Record<string, unknown>;
    dynamicVariables?: Record<string, string>;
    overrideAgentId?: string;
  },
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
        override_agent_id: params.overrideAgentId,
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
// correcta según el modo de la cuenta, y el número saliente de la cuenta si
// lo tiene elegido -- puede venir null en modo master, donde el número real
// lo resuelve la plantilla (asignado por sub-cuenta y por plantilla); el
// llamador decide si con eso alcanza.
export async function resolverCuentaRetell(
  admin: AdminClient,
  cuentaId: string,
): Promise<{ apiKey: string; numeroSaliente: string | null; intervaloMinimoLlamadas: number } | { error: string }> {
  const { data } = await admin
    .from("cuentas_retell")
    .select("modo, api_key_cifrada, numero_saliente, intervalo_minimo_llamadas_minutos")
    .eq("cuenta_id", cuentaId)
    .eq("activo", true)
    .maybeSingle();

  if (!data) return { error: "Esta cuenta no tiene Retell conectado" };

  const apiKey = data.modo === "propia" ? (data.api_key_cifrada ? descifrar(data.api_key_cifrada) : null) : await resolverLlaveMaestraRetell(admin);
  if (!apiKey) return { error: "No se pudo resolver la API key de Retell de esta cuenta" };

  return { apiKey, numeroSaliente: data.numero_saliente, intervaloMinimoLlamadas: data.intervalo_minimo_llamadas_minutos };
}

// contactos.telefono guarda el mismo formato que el wa_id de WhatsApp (sin
// "+"); normalizarDestinatario ya sabe convertirlo al formato de envío real
// -- para Retell (E.164) solo hace falta anteponer el "+".
export function telefonoAE164(telefono: string): string {
  return `+${normalizarDestinatario(telefono)}`;
}

export type AgenteRetell = { agentId: string; nombre: string };

// POST /v2/list-agents -- agentes ya creados en esa cuenta de Retell, para
// el modo "agente propio" (la cuenta ya sabe usar Retell directamente).
export async function listarAgentesRetell(apiKey: string): Promise<{ ok: true; agentes: AgenteRetell[] } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.retellai.com/v2/list-agents", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });
    if (res.status === 401) return { ok: false, error: "La API key no es válida" };
    if (!res.ok) return { ok: false, error: `Retell respondió con un error (${res.status})` };
    const data = (await res.json()) as Array<{ agent_id: string; agent_name?: string }>;
    return { ok: true, agentes: data.map((a) => ({ agentId: a.agent_id, nombre: a.agent_name || a.agent_id })) };
  } catch {
    return { ok: false, error: "No se pudo conectar con Retell" };
  }
}

// PATCH /update-agent/{id} pero solo con webhook_url -- para el modo
// "agente propio" (el admin ya configuró el agente a mano en Retell) no
// tocamos nada de su configuración, solo nos aseguramos de que Retell sepa
// avisarnos cuándo termina una llamada.
export async function asegurarWebhookAgente(
  apiKey: string,
  agentId: string,
  webhookUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // Igual que con los agentes "generados": si ya está publicado, Retell
    // bloquea el PATCH -- hay que abrir un borrador nuevo primero, y como acá
    // sí necesitamos que el webhook_url quede en vivo (no solo en el
    // borrador), se publica esa versión nueva al final.
    const borrador = await abrirBorradorSiPublicado(apiKey, agentId);
    if (!borrador.ok) return borrador;

    const res = await fetch(`https://api.retellai.com/update-agent/${agentId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ webhook_url: webhookUrl }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: (data as { message?: string }).message ?? `Retell respondió con un error (${res.status}) al configurar el webhook` };
    }
    const agente = (await res.json()) as { agent_id: string; version: number };
    await publicarAgenteRetell(apiKey, agente.agent_id, agente.version);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo conectar con Retell para configurar el webhook" };
  }
}

export type VozRetell = { voiceId: string; nombre: string; proveedor: string; acento: string | null; genero: string | null };

// GET /list-voices -- catálogo de voces disponibles, para elegir la del
// agente generado automáticamente desde el Copyscript.
export async function listarVocesRetell(apiKey: string): Promise<{ ok: true; voces: VozRetell[] } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.retellai.com/list-voices", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401) return { ok: false, error: "La API key no es válida" };
    if (!res.ok) return { ok: false, error: `Retell respondió con un error (${res.status})` };
    const data = (await res.json()) as Array<{ voice_id: string; voice_name?: string; provider?: string; accent?: string; gender?: string }>;
    return {
      ok: true,
      voces: data.map((v) => ({
        voiceId: v.voice_id,
        nombre: v.voice_name || v.voice_id,
        proveedor: v.provider ?? "",
        acento: v.accent ?? null,
        genero: v.gender ?? null,
      })),
    };
  } catch {
    return { ok: false, error: "No se pudo conectar con Retell" };
  }
}

// Crea (o actualiza si ya existen) el LLM y el agente de Retell que
// representan una plantilla de voz en modo "generado" -- el Copyscript se
// manda como general_prompt, así que el agente conversa según eso en vez de
// usar el agente por defecto del número saliente.
export type FuncionRetell = {
  type: string;
  name: string;
  description?: string;
  transfer_destination?: { type: "predefined"; number: string };
  transfer_option?: { type: "cold_transfer" };
};

// El panel "Configuración de llamadas" de Retell -- un solo objeto en vez de
// seguir agregando parámetros sueltos a sincronizarAgenteGenerado.
export type ConfiguracionLlamadaVoz = {
  colgarIvr: boolean;
  pantallaLlamadas: boolean;
  dtmfActivo: boolean;
  dtmfTimeoutMs: number;
  dtmfClaveTerminacion: string | null;
  dtmfLimiteDigitos: number | null;
  finSilencioMs: number;
  duracionMaximaMs: number;
  duracionAnilloMs: number;
};

// POST /publish-agent-version/{id} -- create/update-agent solo guarda un
// draft (is_published: false). Sin este paso, Retell nunca manda los
// webhooks call_ended/call_analyzed para llamadas hechas con ese agente,
// aunque el contenido del draft (prompt, funciones) sí se use en la llamada.
async function publicarAgenteRetell(apiKey: string, agentId: string, version: number): Promise<void> {
  try {
    await fetch(`https://api.retellai.com/publish-agent-version/${agentId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
  } catch {
    // Silencioso -- ver comentario en el llamador.
  }
}

// Una vez publicado, Retell bloquea PATCH tanto en el agente como en su LLM
// ("Cannot update published agent/LLM") -- como ahora publicamos siempre
// después de cada guardado, TODA edición posterior llega con el agente ya
// publicado. Antes de tocar nada hay que abrir una versión de borrador nueva
// (create-agent-version) a partir de la última -- el mismo llm_id se
// reutiliza, solo gana una versión interna editable.
async function abrirBorradorSiPublicado(apiKey: string, agentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const resGet = await fetch(`https://api.retellai.com/get-agent/${agentId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!resGet.ok) return { ok: true }; // si no se pudo leer, se intenta seguir igual -- update-agent dará el error real si aplica.
    const agenteActual = (await resGet.json()) as { version: number; is_published: boolean };
    if (!agenteActual.is_published) return { ok: true };

    const resVersion = await fetch(`https://api.retellai.com/create-agent-version/${agentId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ base_version: agenteActual.version }),
    });
    if (!resVersion.ok) {
      const data = await resVersion.json().catch(() => ({}));
      return { ok: false, error: (data as { message?: string }).message ?? `Retell respondió con un error (${resVersion.status}) al abrir un borrador nuevo` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo conectar con Retell" };
  }
}

export async function sincronizarAgenteGenerado(
  apiKey: string,
  params: {
    llmId: string | null;
    agentId: string | null;
    prompt: string;
    voiceId: string;
    nombre: string;
    objetivo: string | null;
    idioma: string;
    colgarBuzon: boolean;
    funciones: FuncionRetell[];
    webhookUrl: string;
    configuracionLlamada: ConfiguracionLlamadaVoz;
  },
): Promise<{ ok: true; llmId: string; agentId: string } | { ok: false; error: string }> {
  try {
    if (params.agentId) {
      const borrador = await abrirBorradorSiPublicado(apiKey, params.agentId);
      if (!borrador.ok) return borrador;
    }

    const resLlm = await fetch(
      params.llmId ? `https://api.retellai.com/update-retell-llm/${params.llmId}` : "https://api.retellai.com/create-retell-llm",
      {
        method: params.llmId ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ general_prompt: params.prompt, general_tools: params.funciones }),
      },
    );
    if (!resLlm.ok) {
      const data = await resLlm.json().catch(() => ({}));
      return { ok: false, error: (data as { message?: string }).message ?? `Retell respondió con un error (${resLlm.status}) al guardar el prompt` };
    }
    const llm = (await resLlm.json()) as { llm_id: string };

    const resAgente = await fetch(
      params.agentId ? `https://api.retellai.com/update-agent/${params.agentId}` : "https://api.retellai.com/create-agent",
      {
        method: params.agentId ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          response_engine: { type: "retell-llm", llm_id: llm.llm_id },
          voice_id: params.voiceId,
          agent_name: params.nombre,
          language: params.idioma,
          voicemail_option: params.colgarBuzon ? { action: { type: "hangup" } } : null,
          webhook_url: params.webhookUrl,
          ivr_option: params.configuracionLlamada.colgarIvr ? { action: { type: "hangup" } } : null,
          call_screening_option: params.configuracionLlamada.pantallaLlamadas
            ? { agent_identity: params.nombre, call_purpose: params.objetivo ?? "" }
            : null,
          allow_user_dtmf: params.configuracionLlamada.dtmfActivo,
          user_dtmf_options: params.configuracionLlamada.dtmfActivo
            ? {
                timeout_ms: params.configuracionLlamada.dtmfTimeoutMs,
                ...(params.configuracionLlamada.dtmfClaveTerminacion
                  ? { termination_key: params.configuracionLlamada.dtmfClaveTerminacion }
                  : {}),
                ...(params.configuracionLlamada.dtmfLimiteDigitos
                  ? { digit_limit: params.configuracionLlamada.dtmfLimiteDigitos }
                  : {}),
              }
            : null,
          end_call_after_silence_ms: params.configuracionLlamada.finSilencioMs,
          max_call_duration_ms: params.configuracionLlamada.duracionMaximaMs,
          ring_duration_ms: params.configuracionLlamada.duracionAnilloMs,
        }),
      },
    );
    if (!resAgente.ok) {
      const data = await resAgente.json().catch(() => ({}));
      return { ok: false, error: (data as { message?: string }).message ?? `Retell respondió con un error (${resAgente.status}) al guardar el agente` };
    }
    const agente = (await resAgente.json()) as { agent_id: string; version: number };

    // create/update-agent solo escriben el draft (is_published queda en
    // false) -- las llamadas en vivo sí lo usan para el contenido, pero
    // Retell nunca llegó a mandar call_ended/call_analyzed a un agente sin
    // publicar (confirmado reproduciendo el webhook a mano: nuestra firma y
    // el guardado funcionan perfecto, Retell simplemente nunca lo dispara).
    // Publicar es un no-op visible si falla -- no vale la pena tronar el
    // guardado de la plantilla por esto.
    await publicarAgenteRetell(apiKey, agente.agent_id, agente.version);

    return { ok: true, llmId: llm.llm_id, agentId: agente.agent_id };
  } catch {
    return { ok: false, error: "No se pudo conectar con Retell" };
  }
}

// Junta lo que necesitan las rutas de plantillas_voz para sincronizar una
// plantilla en modo "generado": resuelve la API key de la cuenta, arma el
// prompt a partir de Objetivo + Copyscript, y crea/actualiza el LLM+agente.
export async function sincronizarPlantillaVozConRetell(
  admin: AdminClient,
  cuentaId: string,
  plantilla: {
    nombre: string;
    copyscript: string;
    objetivo: string | null;
    retell_llm_id: string | null;
    retell_agent_id: string | null;
    retell_voice_id: string | null;
    retell_idioma: string;
    retell_colgar_buzon: boolean;
    retell_funciones: FuncionRetell[];
    retell_colgar_ivr: boolean;
    retell_pantalla_llamadas: boolean;
    retell_dtmf_activo: boolean;
    retell_dtmf_timeout_ms: number;
    retell_dtmf_clave_terminacion: string | null;
    retell_dtmf_limite_digitos: number | null;
    retell_fin_silencio_ms: number;
    retell_duracion_maxima_ms: number;
    retell_duracion_anillo_ms: number;
  },
  webhookUrl: string,
): Promise<{ ok: true; retellLlmId: string; retellAgentId: string; sincronizadoEn: string } | { ok: false; error: string }> {
  if (!plantilla.retell_voice_id) return { ok: false, error: "Falta elegir la voz del agente" };

  const apiKey = await resolverApiKeyRetell(admin, cuentaId);
  if (!apiKey) return { ok: false, error: "Esta cuenta no tiene Retell conectado" };

  const prompt = [plantilla.objetivo ? `Objetivo de la llamada: ${plantilla.objetivo}` : null, plantilla.copyscript]
    .filter(Boolean)
    .join("\n\n");

  const resultado = await sincronizarAgenteGenerado(apiKey, {
    llmId: plantilla.retell_llm_id,
    agentId: plantilla.retell_agent_id,
    prompt,
    voiceId: plantilla.retell_voice_id,
    nombre: plantilla.nombre,
    objetivo: plantilla.objetivo,
    idioma: plantilla.retell_idioma,
    colgarBuzon: plantilla.retell_colgar_buzon,
    funciones: plantilla.retell_funciones,
    webhookUrl,
    configuracionLlamada: {
      colgarIvr: plantilla.retell_colgar_ivr,
      pantallaLlamadas: plantilla.retell_pantalla_llamadas,
      dtmfActivo: plantilla.retell_dtmf_activo,
      dtmfTimeoutMs: plantilla.retell_dtmf_timeout_ms,
      dtmfClaveTerminacion: plantilla.retell_dtmf_clave_terminacion,
      dtmfLimiteDigitos: plantilla.retell_dtmf_limite_digitos,
      finSilencioMs: plantilla.retell_fin_silencio_ms,
      duracionMaximaMs: plantilla.retell_duracion_maxima_ms,
      duracionAnilloMs: plantilla.retell_duracion_anillo_ms,
    },
  });
  if (!resultado.ok) return resultado;

  return { ok: true, retellLlmId: resultado.llmId, retellAgentId: resultado.agentId, sincronizadoEn: new Date().toISOString() };
}

const DESCONEXION_BUZON = new Set(["voicemail_reached"]);

const DESCONEXION_RECHAZADA = new Set(["dial_busy"]);

// ivr_reached (se topó con un IVR del destino, no con un buzón) se agrupa
// aquí -- no se pidió una categoría separada para esto.
const DESCONEXION_NO_CONTESTO = new Set(["dial_no_answer", "ivr_reached", "inactivity", "registered_call_timeout"]);

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
): "completada" | "fallida" | "sin_respuesta" | "buzon" | "rechazada" | "no_contesto" {
  if (callStatus === "error") return "fallida";
  if (disconnectionReason) {
    if (DESCONEXION_BUZON.has(disconnectionReason)) return "buzon";
    if (DESCONEXION_RECHAZADA.has(disconnectionReason)) return "rechazada";
    if (DESCONEXION_NO_CONTESTO.has(disconnectionReason)) return "no_contesto";
    if (DESCONEXION_FALLIDA.has(disconnectionReason) || disconnectionReason.startsWith("error_")) return "fallida";
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

export type LlamadaRetell = {
  callId: string;
  agentId: string | null;
  agentName: string | null;
  callStatus: string;
  disconnectionReason: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  startTimestamp: number | null;
  durationMs: number | null;
  callSuccessful: boolean | null;
  inVoicemail: boolean | null;
  recordingUrl: string | null;
  costoTotal: number | null;
  cuentaId: string | null;
  llamadaVozId: string | null;
};

// POST /v2/list-calls -- el reporte "de verdad" de Retell, sin depender de
// que nuestro webhook haya llegado. cuenta_id/llamada_voz_id vienen del
// metadata que ya mandamos al crear cada llamada (ver crearLlamadaRetell),
// así que no hace falta adivinar a qué sub-cuenta pertenece cada una: el
// dato viaja con la llamada misma, aunque varias cuentas compartan la
// misma key (modo master).
export async function listarLlamadasRetell(apiKey: string, limit = 100): Promise<{ ok: true; llamadas: LlamadaRetell[] } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.retellai.com/v2/list-calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ limit, sort_order: "descending" }),
    });
    if (res.status === 401) return { ok: false, error: "La API key no es válida" };
    if (!res.ok) return { ok: false, error: `Retell respondió con un error (${res.status})` };
    const data = (await res.json()) as Array<{
      call_id: string;
      agent_id?: string;
      agent_name?: string;
      call_status: string;
      disconnection_reason?: string;
      from_number?: string;
      to_number?: string;
      start_timestamp?: number;
      duration_ms?: number;
      call_analysis?: { call_successful?: boolean; in_voicemail?: boolean };
      recording_url?: string;
      call_cost?: { combined_cost?: number };
      metadata?: { cuenta_id?: string; llamada_voz_id?: string };
    }>;
    return {
      ok: true,
      llamadas: data.map((c) => ({
        callId: c.call_id,
        agentId: c.agent_id ?? null,
        agentName: c.agent_name ?? null,
        callStatus: c.call_status,
        disconnectionReason: c.disconnection_reason ?? null,
        fromNumber: c.from_number ?? null,
        toNumber: c.to_number ?? null,
        startTimestamp: c.start_timestamp ?? null,
        durationMs: c.duration_ms ?? null,
        callSuccessful: c.call_analysis?.call_successful ?? null,
        inVoicemail: c.call_analysis?.in_voicemail ?? null,
        recordingUrl: c.recording_url ?? null,
        costoTotal: c.call_cost?.combined_cost ?? null,
        cuentaId: c.metadata?.cuenta_id ?? null,
        llamadaVozId: c.metadata?.llamada_voz_id ?? null,
      })),
    };
  } catch {
    return { ok: false, error: "No se pudo conectar con Retell" };
  }
}
