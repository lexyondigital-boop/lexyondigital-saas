import { createAdminClient } from "@/lib/supabase/admin";
import { enviarMensajeTexto, normalizarDestinatario } from "@/lib/meta";
import { generarRespuestaIA, calcularCostoUsd, type MensajeHistorial, type ProveedorIA, type Herramienta } from "@/lib/ia";
import { descifrar } from "@/lib/cifrado";
import { resolverLlaveDePlataforma } from "@/lib/plataforma-secretos";
import { HERRAMIENTAS_CONSULTA, HERRAMIENTAS_ACCION, crearEjecutorHerramientas, listarProfesionalesParaPrompt } from "@/lib/agente-acciones";
import { resolverVariablesDelPrompt, construirBloqueVariables, construirHerramientaGuardarDatos } from "@/lib/agente-prompt-variables";
import type { CampoPersonalizado } from "@/lib/campos-personalizados";

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

// El LLM no trae reloj propio -- sin decirle la fecha actual, no tiene forma
// de saber qué día es "hoy" o "mañana" para validar horarios de citas.
function fechaActualLegible(): string {
  const formato = new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return formato;
}

function construirSystemPrompt(
  config: { prompt: string | null; tono: string; idioma: string },
  profesionalesTexto: string | null,
  bloqueVariables: string | null,
): string {
  const base = config.prompt?.trim() || "Eres un asistente de atención al cliente por WhatsApp.";
  const bloqueAgenda = profesionalesTexto
    ? `\n\n${profesionalesTexto}\n\nPara agendar, reagendar, cancelar o consultar horarios usa siempre las herramientas disponibles -- nunca inventes ni asumas disponibilidad, ids de citas o de profesionales.`
    : "";
  const bloqueDatos = bloqueVariables ? `\n\n${bloqueVariables}` : "";
  return `${base}\n\nFecha y hora actual (zona horaria de México): ${fechaActualLegible()}. Usa este dato como referencia real de "hoy" para calcular cualquier día, fecha u horario que menciones o valides -- nunca lo inventes ni asumas otro.${bloqueAgenda}${bloqueDatos}\n\nResponde siempre en idioma "${config.idioma}", con un tono ${config.tono}. Sé breve y claro, como en una conversación real de WhatsApp.`;
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

  if (!config || !config.activo) {
    console.error(`Cuenta ${cuentaId}: agente IA no responde -- agente_config ${config ? "está desactivado" : "no existe para esta cuenta"}.`);
    return;
  }

  const { data: cuentaWhatsapp } = await supabase
    .from("cuentas_whatsapp")
    .select("id, phone_number_id")
    .eq("cuenta_id", cuentaId)
    .eq("estado", "activo")
    .maybeSingle();

  if (!cuentaWhatsapp) {
    console.error(`Cuenta ${cuentaId}: agente IA no responde -- no hay cuentas_whatsapp activa.`);
    return;
  }

  const { data: credencial } = await supabase
    .from("whatsapp_credenciales")
    .select("access_token")
    .eq("cuenta_whatsapp_id", cuentaWhatsapp.id)
    .maybeSingle();

  if (!credencial) {
    console.error(`Cuenta ${cuentaId}: agente IA no responde -- falta whatsapp_credenciales para cuenta_whatsapp ${cuentaWhatsapp.id}.`);
    return;
  }

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

  // Las herramientas que modifican datos (crear/reagendar/cancelar) solo se
  // ofrecen fuera de modo "sugestivo" -- ahí un humano todavía aprueba el
  // texto antes de mandarlo, así que el modelo no debe poder tocar citas
  // reales mientras solo está redactando una sugerencia. En automático y
  // semi_automatico el agente ya manda mensajes por su cuenta (ver más abajo),
  // así que también puede actuar sobre la agenda por su cuenta.
  const profesionalesPermitidos: string[] | null = config.profesionales_ids ?? null;
  const profesionalesTexto = await listarProfesionalesParaPrompt(cuentaId, profesionalesPermitidos);

  // Variables (sección "Variables") que aparecen como {{clave}} en el prompt
  // de esta cuenta -- se ofrecen sin importar el modo, porque guardar datos
  // del contacto no le manda nada al cliente ni toca su agenda; solo deja el
  // registro listo para cuando sí se agende o para que lo vea un humano.
  const { data: camposPersonalizados } = await supabase.from("campos_personalizados").select("*").eq("cuenta_id", cuentaId);
  const { usadas: camposUsados } = resolverVariablesDelPrompt(config.prompt ?? "", (camposPersonalizados ?? []) as CampoPersonalizado[]);
  const bloqueVariables = construirBloqueVariables(camposUsados);
  const herramientaGuardarDatos = construirHerramientaGuardarDatos(camposUsados);

  const herramientasAgenda: Herramienta[] = profesionalesTexto
    ? [...HERRAMIENTAS_CONSULTA, ...(config.modo !== "sugestivo" ? HERRAMIENTAS_ACCION : [])]
    : [];
  const herramientas: Herramienta[] | undefined =
    herramientasAgenda.length > 0 || herramientaGuardarDatos
      ? [...herramientasAgenda, ...(herramientaGuardarDatos ? [herramientaGuardarDatos] : [])]
      : undefined;
  const ejecutarHerramienta = herramientas
    ? crearEjecutorHerramientas({ cuentaId, contactoId, conversacionId, profesionalesPermitidos, camposUsados })
    : undefined;

  const resultado = await generarRespuestaIA({
    proveedor,
    apiKey,
    systemPrompt: construirSystemPrompt(config, profesionalesTexto, bloqueVariables),
    historial,
    mensajeNuevo: textoEntrante,
    herramientas,
    ejecutarHerramienta,
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
