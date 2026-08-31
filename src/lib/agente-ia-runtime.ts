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

// El texto libre que escribe el administrador (o que generó el asistente de
// IA en otro momento) puede quedar desactualizado frente a la configuración
// real de la cuenta -- por ejemplo, el prompt puede decir "no tienes agenda"
// porque se escribió antes de asignarle un profesional, y luego el admin
// activa uno sin volver a tocar el texto. Por eso el prompt final se arma en
// secciones con encabezados y una regla de prioridad explícita: las secciones
// "instrucción técnica del sistema" reflejan la configuración real vigente y
// siempre ganan sobre cualquier afirmación contraria en el texto de negocio,
// en vez de dejar que el modelo reciba dos instrucciones contradictorias sin
// forma de resolverlas (causa raíz de que el agente pareciera "no hacerle
// caso" al prompt de forma inconsistente).
function construirBloqueFaqs(faqs: { pregunta: string; respuesta: string }[]): string | null {
  if (faqs.length === 0) return null;
  const lineas = faqs.map((f) => `P: ${f.pregunta}\nR: ${f.respuesta}`);
  return `Estas son preguntas frecuentes ya revisadas y aprobadas por el negocio. Si el cliente pregunta algo que coincide con alguna de estas, responde con esa información (puedes adaptar la redacción al tono de la conversación, pero no cambies el contenido):\n\n${lineas.join("\n\n")}`;
}

function construirBloqueDocumentos(documentos: { nombre_archivo: string; url: string }[]): string | null {
  if (documentos.length === 0) return null;
  const lineas = documentos.map((d) => `- ${d.nombre_archivo}: ${d.url}`);
  return `Tienes estos documentos de referencia disponibles (solo conoces su nombre y enlace, no su contenido interno):\n${lineas.join("\n")}\n\nSi el cliente pregunta algo que podría estar en alguno de ellos, puedes compartir el enlace correspondiente -- pero nunca inventes ni asumas qué dice adentro.`;
}

// El texto libre que escribe el administrador (o que generó el asistente de
// IA en otro momento) puede quedar desactualizado frente a la configuración
// real de la cuenta -- por ejemplo, el prompt puede decir "no tienes agenda"
// porque se escribió antes de asignarle un profesional, y luego el admin
// activa uno sin volver a tocar el texto. Por eso el prompt final se arma en
// secciones con encabezados y una regla de prioridad explícita: las secciones
// "instrucción técnica del sistema" reflejan la configuración real vigente y
// siempre ganan sobre cualquier afirmación contraria en el texto de negocio,
// en vez de dejar que el modelo reciba dos instrucciones contradictorias sin
// forma de resolverlas (causa raíz de que el agente pareciera "no hacerle
// caso" al prompt de forma inconsistente). Los bloques de FAQs, documentos y
// el cierre de "si no sabes, no inventes" se agregan siempre desde aquí, no
// desde el texto del admin ni del asistente de generación -- así ninguna
// cuenta se queda sin ellos solo porque el administrador no supo redactarlos
// o el asistente los omitió.
function construirSystemPrompt(
  config: { prompt: string | null; tono: string; idioma: string },
  profesionalesTexto: string | null,
  bloqueVariables: string | null,
  bloqueFaqs: string | null,
  bloqueDocumentos: string | null,
): string {
  const base = config.prompt?.trim() || "Eres un asistente de atención al cliente por WhatsApp.";

  const bloqueAgenda = profesionalesTexto
    ? `\n\n=== AGENDA (instrucción técnica del sistema) ===\nSí tienes acceso a una agenda de citas y a herramientas para consultarla, agendar, reagendar y cancelar. Si el texto de negocio de arriba afirma que no tienes agenda o que no puedes agendar citas, ignora esa afirmación: está desactualizada, la configuración real de esta cuenta es la que sigue.\n\n${profesionalesTexto}\n\nUsa siempre las herramientas disponibles para estas acciones -- nunca inventes ni asumas disponibilidad, ids de citas o de profesionales.`
    : `\n\n=== AGENDA (instrucción técnica del sistema) ===\nNo tienes acceso a una agenda de citas ni herramientas para agendar, reagendar o cancelar. Si el texto de negocio de arriba da por hecho que sí la tienes, ignora esa parte: no ofrezcas agendar ni menciones horarios o disponibilidad.`;

  const bloqueDatos = bloqueVariables
    ? `\n\n=== DATOS A CAPTURAR DEL CLIENTE (instrucción técnica del sistema) ===\n${bloqueVariables}`
    : "";

  const bloqueFaqsFinal = bloqueFaqs ? `\n\n=== PREGUNTAS FRECUENTES (instrucción técnica del sistema) ===\n${bloqueFaqs}` : "";
  const bloqueDocumentosFinal = bloqueDocumentos
    ? `\n\n=== DOCUMENTOS DE REFERENCIA (instrucción técnica del sistema) ===\n${bloqueDocumentos}`
    : "";

  return `=== INSTRUCCIONES DE NEGOCIO (definidas por el administrador de esta cuenta) ===\n${base}

=== FECHA Y HORA (instrucción técnica del sistema) ===\nFecha y hora actual (zona horaria de México): ${fechaActualLegible()}. Úsala como referencia real de "hoy" para calcular cualquier día, fecha u horario que menciones o valides -- nunca la inventes ni asumas otra.${bloqueAgenda}${bloqueDatos}${bloqueFaqsFinal}${bloqueDocumentosFinal}

=== ESTILO DE RESPUESTA (instrucción técnica del sistema) ===\nResponde siempre en idioma "${config.idioma}", con un tono ${config.tono}. Sé breve y claro, como en una conversación real de WhatsApp.

=== CUANDO NO SEPAS LA RESPUESTA (instrucción técnica del sistema) ===\nSi la pregunta del cliente no está cubierta por las instrucciones de negocio, las preguntas frecuentes ni los documentos de arriba, sé honesto: no inventes precios, políticas, plazos ni ningún otro dato. Dilo con naturalidad y ofrece transferir la conversación con un humano o pide que aclare su duda.

Si alguna sección anterior entra en conflicto con otra, las secciones marcadas "instrucción técnica del sistema" siempre tienen prioridad: reflejan la configuración real y vigente de esta cuenta, mientras que el texto de negocio pudo quedar desactualizado si el administrador cambió su configuración (agenda, variables, FAQs, etc.) sin reescribirlo.`;
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
    .select("agente_ia_activo, agente_activado_en")
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

  // Se cuenta solo desde la última vez que el agente se activó (creación de
  // la conversación, o reactivación manual tras una transferencia) -- no el
  // histórico completo, para que una conversación longeva no quede
  // transfiriendo para siempre aunque un humano la reactive.
  const { count: turnosBot } = await supabase
    .from("mensajes")
    .select("id", { count: "exact", head: true })
    .eq("conversacion_id", conversacionId)
    .eq("direccion", "saliente")
    .eq("tipo", "texto")
    .gte("created_at", conversacion.agente_activado_en);

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

  // FAQs y documentos de referencia -- configurados en pestañas separadas del
  // Agente IA, se inyectan siempre desde aquí (no dependen de que el admin o
  // el asistente de generación se acuerden de mencionarlos en el prompt).
  const [{ data: faqs }, { data: documentos }] = await Promise.all([
    supabase.from("agente_faqs").select("pregunta, respuesta").eq("cuenta_id", cuentaId),
    supabase.from("agente_documentos").select("nombre_archivo, url").eq("cuenta_id", cuentaId),
  ]);
  const bloqueFaqs = construirBloqueFaqs(faqs ?? []);
  const bloqueDocumentos = construirBloqueDocumentos(documentos ?? []);

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
    systemPrompt: construirSystemPrompt(config, profesionalesTexto, bloqueVariables, bloqueFaqs, bloqueDocumentos),
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
