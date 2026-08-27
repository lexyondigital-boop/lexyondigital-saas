import { createAdminClient } from "@/lib/supabase/admin";
import { enviarMensajeTexto, normalizarDestinatario } from "@/lib/meta";
import { generarRespuestaIA, calcularCostoUsd, type MensajeHistorial, type ProveedorIA } from "@/lib/ia";
import { descifrar } from "@/lib/cifrado";

type AdminClient = ReturnType<typeof createAdminClient>;

// Único mercado activo hoy (mismo supuesto que normalizarDestinatario en
// meta.ts) -- si se abre a otro país hay que dejar de asumir un solo huso.
const ZONA_HORARIA = "America/Mexico_City";

function horaActualEnMinutos(): number {
  const formato = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const [h, m] = formato.split(":").map(Number);
  return h * 60 + m;
}

function minutosDesdeHora(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function construirSystemPrompt(config: { prompt: string | null; tono: string; idioma: string }): string {
  const base = config.prompt?.trim() || "Eres un asistente de atención al cliente por WhatsApp.";
  return `${base}\n\nResponde siempre en idioma "${config.idioma}", con un tono ${config.tono}. Sé breve y claro, como en una conversación real de WhatsApp.`;
}

// El modo "platform_key" prioriza la key guardada en plataforma_secretos
// (rotable desde /configuracion sin tocar el servidor) y cae al .env del
// contenedor solo si todavía no se ha configurado ninguna ahí.
async function resolverLlaveDePlataforma(supabase: AdminClient, proveedor: ProveedorIA): Promise<string | null> {
  const clave = proveedor === "openai" ? "openai_api_key" : "anthropic_api_key";

  const { data } = await supabase.from("plataforma_secretos").select("valor_cifrado").eq("clave", clave).maybeSingle();

  if (data?.valor_cifrado) return descifrar(data.valor_cifrado);

  return proveedor === "openai" ? process.env.OPENAI_API_KEY ?? null : process.env.ANTHROPIC_API_KEY ?? null;
}

// Llamado por el webhook de WhatsApp justo después de insertar el mensaje
// entrante. Decide si el agente responde (horario, palabras de
// transferencia, tope de turnos), llama al LLM que corresponda según la
// configuración de la cuenta, y-- según la modalidad-- guarda una sugerencia
// para que la revise un humano, o contesta directo por WhatsApp.
export async function procesarAgenteIA({
  cuentaId,
  conversacionId,
  contactoId,
  telefono,
  mensajeEntranteId,
  textoEntrante,
}: {
  cuentaId: string;
  conversacionId: string;
  contactoId: string;
  telefono: string;
  mensajeEntranteId: string;
  textoEntrante: string;
}) {
  const supabase = createAdminClient();

  const { data: conversacion } = await supabase
    .from("conversaciones")
    .select("agente_ia_activo")
    .eq("id", conversacionId)
    .single();

  if (!conversacion?.agente_ia_activo) return;

  const { data: config } = await supabase.from("agente_config").select("*").eq("cuenta_id", cuentaId).maybeSingle();

  if (!config || !config.activo) return;

  const { data: cuentaWhatsapp } = await supabase
    .from("cuentas_whatsapp")
    .select("id, phone_number_id")
    .eq("cuenta_id", cuentaId)
    .eq("estado", "activo")
    .maybeSingle();

  if (!cuentaWhatsapp) return;

  const { data: credencial } = await supabase
    .from("whatsapp_credenciales")
    .select("access_token")
    .eq("cuenta_whatsapp_id", cuentaWhatsapp.id)
    .maybeSingle();

  if (!credencial) return;

  async function responderDirecto(texto: string) {
    const resultado = await enviarMensajeTexto({
      phoneNumberId: cuentaWhatsapp!.phone_number_id,
      accessToken: credencial!.access_token,
      to: normalizarDestinatario(telefono),
      texto,
    });

    await supabase.from("mensajes").insert({
      cuenta_id: cuentaId,
      conversacion_id: conversacionId,
      contacto_id: contactoId,
      direccion: "saliente",
      tipo: "texto",
      contenido: texto,
      status: resultado.ok ? "enviado" : "fallido",
      whatsapp_message_id: resultado.whatsappMessageId,
    });
  }

  const horaActual = horaActualEnMinutos();
  const inicio = minutosDesdeHora(config.horario_inicio);
  const fin = minutosDesdeHora(config.horario_fin);
  const dentroDeHorario = inicio <= fin ? horaActual >= inicio && horaActual <= fin : horaActual >= inicio || horaActual <= fin;

  if (!dentroDeHorario) {
    if (config.mensaje_fuera_horario) await responderDirecto(config.mensaje_fuera_horario);
    return;
  }

  const disparaTransferencia = (config.trigger_palabras ?? []).some((palabra: string) =>
    textoEntrante.toLowerCase().includes(palabra.toLowerCase()),
  );

  if (disparaTransferencia) {
    await supabase.from("conversaciones").update({ agente_ia_activo: false }).eq("id", conversacionId);
    if (config.mensaje_transferencia) await responderDirecto(config.mensaje_transferencia);
    return;
  }

  const { count: turnosBot } = await supabase
    .from("mensajes")
    .select("id", { count: "exact", head: true })
    .eq("conversacion_id", conversacionId)
    .eq("direccion", "saliente")
    .eq("tipo", "texto");

  if ((turnosBot ?? 0) >= config.max_mensajes) {
    await supabase.from("conversaciones").update({ agente_ia_activo: false }).eq("id", conversacionId);
    if (config.mensaje_transferencia) await responderDirecto(config.mensaje_transferencia);
    return;
  }

  const proveedor = config.proveedor_ia as ProveedorIA;
  let apiKey: string | null = null;

  if (config.modo_api === "user_key") {
    if (!config.api_key_usuario_cifrada) {
      console.error(`Cuenta ${cuentaId}: agente en modo user_key sin API key configurada.`);
      return;
    }
    apiKey = descifrar(config.api_key_usuario_cifrada);
  } else {
    apiKey = await resolverLlaveDePlataforma(supabase, proveedor);
    if (!apiKey) {
      console.error(`Cuenta ${cuentaId}: modo platform_key pero falta la API key de plataforma para ${proveedor}.`);
      return;
    }
  }

  const { data: historialCrudo } = await supabase
    .from("mensajes")
    .select("direccion, contenido")
    .eq("conversacion_id", conversacionId)
    .eq("tipo", "texto")
    .not("contenido", "is", null)
    .order("created_at", { ascending: false })
    .limit(21);

  // El más reciente de estos 21 es el mensaje entrante recién insertado --
  // se manda aparte como mensajeNuevo, el resto es el historial previo.
  const historial: MensajeHistorial[] = (historialCrudo ?? [])
    .reverse()
    .slice(0, -1)
    .map((m) => ({ role: m.direccion === "entrante" ? ("user" as const) : ("assistant" as const), content: m.contenido as string }));

  const resultado = await generarRespuestaIA({
    proveedor,
    apiKey,
    systemPrompt: construirSystemPrompt(config),
    historial,
    mensajeNuevo: textoEntrante,
  });

  if (!resultado.ok || !resultado.texto) {
    console.error(`Cuenta ${cuentaId}: falló la generación de IA:`, resultado.error);
    return;
  }

  await supabase.from("agente_uso_ia").insert({
    cuenta_id: cuentaId,
    contacto_id: contactoId,
    conversacion_id: conversacionId,
    proveedor,
    modalidad: config.modo === "sugestivo" ? "sugestivo" : "automatico",
    tokens_entrada: resultado.tokensEntrada,
    tokens_salida: resultado.tokensSalida,
    tokens_total: resultado.tokensEntrada + resultado.tokensSalida,
    costo_usd: calcularCostoUsd(proveedor, resultado.tokensEntrada, resultado.tokensSalida),
  });

  if (config.modo === "sugestivo") {
    await supabase.from("mensajes").update({ sugerencia_ia: resultado.texto }).eq("id", mensajeEntranteId);
    return;
  }

  await responderDirecto(resultado.texto);
}
