import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarMensajePlantilla, normalizarDestinatario } from "@/lib/meta";
import { moverDealEtapa, obtenerDealAbiertoDeContacto } from "@/lib/deals";
import { resolverParametrosPlantilla, obtenerValoresContactoPorClave, sustituirParametrosPlantilla } from "@/lib/variables-contacto";
import { enviarCorreo, reemplazarVariablesEmail, extraerClavesVariables } from "@/lib/email-envio";
import { obtenerOCrearConversacion } from "@/lib/conversaciones";
import { resolverCuentaRetell, crearLlamadaRetell, telefonoAE164 } from "@/lib/retell";
import { detectarClavesEnPrompt } from "@/lib/agente-prompt-variables";

type AdminClient = ReturnType<typeof createAdminClient>;

// Llamado por un cron externo (crontab en la VPS) una vez por minuto. En cada
// invocación, cada campaña 'enviando' avanza exactamente un contacto pendiente
// — el propio intervalo del cron da el espaciado que en n8n daba el nodo Wait.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Promueve a "enviando" las campañas programadas cuya hora ya llegó --
  // "Enviar ahora" hace lo mismo de forma manual e inmediata vía
  // /api/campanas/[id]/iniciar; esto es el disparador automático.
  await supabase
    .from("campanas")
    .update({ status: "enviando" })
    .eq("status", "borrador")
    .not("programado_para", "is", null)
    .lte("programado_para", new Date().toISOString())
    .gt("total_destinatarios", 0);

  const { data: campanas, error } = await supabase
    .from("campanas")
    .select("id, cuenta_id, template_id, etiqueta_id, canal, plantilla_email_id, plantilla_voz_id, intervalo_minutos")
    .eq("status", "enviando");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resultados = [];
  for (const campana of campanas ?? []) {
    resultados.push(await avanzarCampana(supabase, campana));
  }

  return NextResponse.json({ ok: true, campanas_procesadas: resultados.length, resultados });
}

async function avanzarCampana(
  supabase: AdminClient,
  campana: {
    id: string;
    cuenta_id: string;
    template_id: string | null;
    etiqueta_id: string | null;
    canal: "whatsapp" | "correo" | "voz";
    plantilla_email_id: string | null;
    plantilla_voz_id: string | null;
    intervalo_minutos: number;
  },
) {
  // Con intervalo_minutos > 1 (default 1 -- el ritmo de siempre, uno por
  // cada minuto del cron), se espera a que pase ese tiempo desde el último
  // intento (haya salido bien o mal) antes de disparar el siguiente --
  // mitigación para el 131049 de Meta en campañas de audiencia fría.
  if (campana.intervalo_minutos > 1) {
    const { data: ultimo } = await supabase
      .from("campana_contactos")
      .select("procesado_at")
      .eq("campana_id", campana.id)
      .not("procesado_at", "is", null)
      .order("procesado_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ultimo?.procesado_at) {
      const minutosTranscurridos = (Date.now() - new Date(ultimo.procesado_at).getTime()) / 60_000;
      if (minutosTranscurridos < campana.intervalo_minutos) {
        return { campana_id: campana.id, esperando: true };
      }
    }
  }

  const { data: pendiente } = await supabase
    .from("campana_contactos")
    .select("id, contacto_id, variables")
    .eq("campana_id", campana.id)
    .eq("status", "pendiente")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pendiente) {
    return finalizarCampana(supabase, campana.id);
  }

  await supabase.from("campana_contactos").update({ procesado_at: new Date().toISOString() }).eq("id", pendiente.id);

  if (campana.canal === "correo") {
    return avanzarCampanaCorreo(supabase, campana, pendiente);
  }

  if (campana.canal === "voz") {
    return avanzarCampanaVoz(supabase, campana, pendiente);
  }

  if (!campana.template_id) {
    return { campana_id: campana.id, error: "La campaña no tiene plantilla asignada" };
  }

  const { data: template } = await supabase
    .from("templates")
    .select("name, language, status, body, etiquetas_envio, etapa_destino_id, variables, variables_mapeo, header_tipo, header_media_url")
    .eq("id", campana.template_id)
    .maybeSingle();

  if (!template || template.status !== "approved") {
    return { campana_id: campana.id, error: "Plantilla no aprobada o no encontrada" };
  }

  const { data: contacto } = await supabase
    .from("contactos")
    .select("id, telefono, etiquetas")
    .eq("id", pendiente.contacto_id)
    .single();

  if (!contacto) {
    await supabase.from("campana_contactos").update({ status: "fallido" }).eq("id", pendiente.id);
    return { campana_id: campana.id, error: "Contacto de la campaña ya no existe" };
  }

  const { data: cuentaWhatsapp } = await supabase
    .from("cuentas_whatsapp")
    .select("id, phone_number_id")
    .eq("cuenta_id", campana.cuenta_id)
    .eq("estado", "activo")
    .maybeSingle();

  if (!cuentaWhatsapp) {
    return { campana_id: campana.id, error: "La cuenta no tiene WhatsApp conectado" };
  }

  const { data: credencial } = await supabase
    .from("whatsapp_credenciales")
    .select("access_token")
    .eq("cuenta_whatsapp_id", cuentaWhatsapp.id)
    .maybeSingle();

  if (!credencial) {
    return { campana_id: campana.id, error: "Falta la credencial de WhatsApp de la cuenta" };
  }

  const conversacion = await obtenerOCrearConversacion(supabase, campana.cuenta_id, contacto.id, contacto.telefono);

  const parametros = await resolverParametrosPlantilla(supabase, campana.cuenta_id, contacto.id, template, pendiente.variables);

  const resultado = await enviarMensajePlantilla({
    phoneNumberId: cuentaWhatsapp.phone_number_id,
    accessToken: credencial.access_token,
    to: normalizarDestinatario(contacto.telefono),
    nombrePlantilla: template.name,
    idioma: template.language,
    parametros,
    header: { tipo: template.header_tipo, mediaUrl: template.header_media_url },
  });

  if (resultado.ok) {
    await registrarEnvioExitoso(supabase, { campana, pendiente, contacto, template, parametros, conversacionId: conversacion?.id, whatsappMessageId: resultado.whatsappMessageId });
  } else {
    console.error(`Campaña ${campana.id}, contacto ${contacto.id}: falló el envío:`, JSON.stringify(resultado.raw));
    await registrarEnvioFallido(supabase, { campana, pendiente, contacto, template, parametros, conversacionId: conversacion?.id });
  }

  return { campana_id: campana.id, contacto_id: contacto.id, ok: resultado.ok };
}

async function avanzarCampanaCorreo(
  supabase: AdminClient,
  campana: { id: string; cuenta_id: string; etiqueta_id: string | null; plantilla_email_id: string | null },
  pendiente: { id: string; contacto_id: string },
) {
  if (!campana.plantilla_email_id) {
    return { campana_id: campana.id, error: "La campaña no tiene plantilla de correo asignada" };
  }

  const { data: plantilla } = await supabase
    .from("plantillas_email")
    .select("asunto, cuerpo_html")
    .eq("id", campana.plantilla_email_id)
    .maybeSingle();

  if (!plantilla) {
    return { campana_id: campana.id, error: "Plantilla de correo no encontrada" };
  }

  const { data: contacto } = await supabase
    .from("contactos")
    .select("id, correo_electronico, nombre_completo, nombre, etiquetas")
    .eq("id", pendiente.contacto_id)
    .single();

  if (!contacto) {
    await supabase.from("campana_contactos").update({ status: "fallido" }).eq("id", pendiente.id);
    return { campana_id: campana.id, error: "Contacto de la campaña ya no existe" };
  }

  if (!contacto.correo_electronico) {
    await supabase.from("campana_contactos").update({ status: "fallido" }).eq("id", pendiente.id);
    await supabase.from("contactos").update({ campana_status: "fallido" }).eq("id", contacto.id);
    return { campana_id: campana.id, contacto_id: contacto.id, ok: false, error: "El contacto no tiene correo capturado" };
  }

  const claves = extraerClavesVariables(plantilla.asunto, plantilla.cuerpo_html);
  const valoresContacto = await obtenerValoresContactoPorClave(supabase, campana.cuenta_id, contacto.id, claves);
  const valores: Record<string, string> = { ...valoresContacto, nombre: contacto.nombre_completo ?? contacto.nombre ?? "" };

  const resultado = await enviarCorreo({
    cuentaId: campana.cuenta_id,
    contactoId: contacto.id,
    campanaId: campana.id,
    destinatario: contacto.correo_electronico,
    asunto: reemplazarVariablesEmail(plantilla.asunto, valores),
    cuerpoHtml: reemplazarVariablesEmail(plantilla.cuerpo_html, valores),
  });

  if (resultado.ok) {
    await supabase.from("campana_contactos").update({ status: "enviado", enviado_at: new Date().toISOString() }).eq("id", pendiente.id);

    let etiquetas = contacto.etiquetas ?? [];
    if (campana.etiqueta_id) {
      const { data: etiqueta } = await supabase.from("etiquetas").select("nombre").eq("id", campana.etiqueta_id).maybeSingle();
      if (etiqueta && !etiquetas.includes(etiqueta.nombre)) etiquetas = [...etiquetas, etiqueta.nombre];
    }

    await supabase.from("contactos").update({ etiquetas, campana_status: "enviado", canal_origen: "campaña" }).eq("id", contacto.id);
  } else {
    console.error(`Campaña ${campana.id}, contacto ${contacto.id}: falló el correo:`, resultado.error);
    await supabase.from("campana_contactos").update({ status: "fallido" }).eq("id", pendiente.id);
    await supabase.from("contactos").update({ campana_status: "fallido" }).eq("id", contacto.id);
  }

  return { campana_id: campana.id, contacto_id: contacto.id, ok: resultado.ok };
}

// Replica el flujo manual de POST /api/llamadas-voz (número de la plantilla
// con respaldo en el de la cuenta, intervalo anti-spam,
// obtenerOCrearConversacion) -- la llamada es asíncrona, así que "enviado"
// aquí solo significa que Retell aceptó la llamada; el resultado real
// (contestó/buzón/rechazó) llega después por el webhook de siempre y se ve
// en Agentes de Voz, no en esta tabla.
async function avanzarCampanaVoz(
  supabase: AdminClient,
  campana: { id: string; cuenta_id: string; etiqueta_id: string | null; plantilla_voz_id: string | null },
  pendiente: { id: string; contacto_id: string },
) {
  if (!campana.plantilla_voz_id) {
    return { campana_id: campana.id, error: "La campaña no tiene agente de voz asignado" };
  }

  const { data: plantilla } = await supabase
    .from("plantillas_voz")
    .select("id, publicada, retell_agent_id, retell_numero_saliente, copyscript, objetivo")
    .eq("id", campana.plantilla_voz_id)
    .maybeSingle();

  if (!plantilla || !plantilla.publicada || !plantilla.retell_agent_id) {
    return { campana_id: campana.id, error: "El agente de voz de la campaña no está listo (sin publicar o sin sincronizar con Retell)" };
  }

  const { data: contacto } = await supabase
    .from("contactos")
    .select("id, telefono, etiquetas")
    .eq("id", pendiente.contacto_id)
    .single();

  if (!contacto) {
    await supabase.from("campana_contactos").update({ status: "fallido" }).eq("id", pendiente.id);
    return { campana_id: campana.id, error: "Contacto de la campaña ya no existe" };
  }

  const cuentaRetell = await resolverCuentaRetell(supabase, campana.cuenta_id);
  if ("error" in cuentaRetell) {
    await supabase.from("campana_contactos").update({ status: "fallido" }).eq("id", pendiente.id);
    await supabase.from("contactos").update({ campana_status: "fallido" }).eq("id", contacto.id);
    return { campana_id: campana.id, contacto_id: contacto.id, ok: false, error: cuentaRetell.error };
  }

  // El número de la plantilla (asignado por sub-cuenta y por plantilla)
  // tiene prioridad -- el de la cuenta es el respaldo de siempre (modo
  // propia, o agentes creados antes de este sistema).
  const numeroSaliente = plantilla.retell_numero_saliente ?? cuentaRetell.numeroSaliente;
  if (!numeroSaliente) {
    await supabase.from("campana_contactos").update({ status: "fallido" }).eq("id", pendiente.id);
    await supabase.from("contactos").update({ campana_status: "fallido" }).eq("id", contacto.id);
    return { campana_id: campana.id, contacto_id: contacto.id, ok: false, error: "Falta el número saliente de Retell" };
  }

  const desde = new Date(Date.now() - cuentaRetell.intervaloMinimoLlamadas * 60_000).toISOString();
  const { data: llamadaReciente } = await supabase
    .from("llamadas_voz")
    .select("id")
    .eq("contacto_id", contacto.id)
    .gte("created_at", desde)
    .limit(1)
    .maybeSingle();

  if (llamadaReciente) {
    await supabase.from("campana_contactos").update({ status: "fallido" }).eq("id", pendiente.id);
    await supabase.from("contactos").update({ campana_status: "fallido" }).eq("id", contacto.id);
    return { campana_id: campana.id, contacto_id: contacto.id, ok: false, error: "Se llamó a este contacto hace muy poco" };
  }

  const conversacion = await obtenerOCrearConversacion(supabase, campana.cuenta_id, contacto.id, contacto.telefono);

  const { data: llamada, error: llamadaError } = await supabase
    .from("llamadas_voz")
    .insert({
      cuenta_id: campana.cuenta_id,
      contacto_id: contacto.id,
      conversacion_id: conversacion?.id ?? null,
      plantilla_voz_id: plantilla.id,
      campana_id: campana.id,
      campana_contacto_id: pendiente.id,
      status: "en_progreso",
    })
    .select()
    .single();

  if (llamadaError || !llamada) {
    await supabase.from("campana_contactos").update({ status: "fallido" }).eq("id", pendiente.id);
    await supabase.from("contactos").update({ campana_status: "fallido" }).eq("id", contacto.id);
    return { campana_id: campana.id, contacto_id: contacto.id, ok: false, error: llamadaError?.message ?? "No se pudo registrar la llamada" };
  }

  // {{clave}} del Copyscript que ya tengan un valor real para este contacto
  // (ej. turno_visita cargado por el CSV de la campaña) -- Retell las
  // sustituye en el prompt antes de que la llamada empiece.
  const claves = detectarClavesEnPrompt([plantilla.objetivo, plantilla.copyscript].filter(Boolean).join("\n\n"));
  const dynamicVariables =
    claves.length > 0 ? await obtenerValoresContactoPorClave(supabase, campana.cuenta_id, contacto.id, claves) : undefined;

  const resultado = await crearLlamadaRetell(cuentaRetell.apiKey, {
    fromNumber: numeroSaliente,
    toNumber: telefonoAE164(contacto.telefono),
    metadata: { cuenta_id: campana.cuenta_id, llamada_voz_id: llamada.id },
    overrideAgentId: plantilla.retell_agent_id,
    dynamicVariables,
  });

  if (!resultado.ok) {
    console.error(`Campaña ${campana.id}, contacto ${contacto.id}: falló la llamada:`, resultado.error);
    await supabase.from("llamadas_voz").update({ status: "fallida", actualizado_at: new Date().toISOString() }).eq("id", llamada.id);
    await supabase.from("campana_contactos").update({ status: "fallido" }).eq("id", pendiente.id);
    await supabase.from("contactos").update({ campana_status: "fallido" }).eq("id", contacto.id);
    return { campana_id: campana.id, contacto_id: contacto.id, ok: false, error: resultado.error };
  }

  await supabase.from("llamadas_voz").update({ retell_call_id: resultado.callId }).eq("id", llamada.id);
  await supabase.from("campana_contactos").update({ status: "enviado", enviado_at: new Date().toISOString() }).eq("id", pendiente.id);

  let etiquetas = contacto.etiquetas ?? [];
  if (campana.etiqueta_id) {
    const { data: etiqueta } = await supabase.from("etiquetas").select("nombre").eq("id", campana.etiqueta_id).maybeSingle();
    if (etiqueta && !etiquetas.includes(etiqueta.nombre)) etiquetas = [...etiquetas, etiqueta.nombre];
  }
  await supabase.from("contactos").update({ etiquetas, campana_status: "enviado", canal_origen: "campaña" }).eq("id", contacto.id);

  return { campana_id: campana.id, contacto_id: contacto.id, ok: true };
}

async function registrarEnvioExitoso(
  supabase: AdminClient,
  params: {
    campana: { id: string; cuenta_id: string; etiqueta_id: string | null };
    pendiente: { id: string };
    contacto: { id: string; etiquetas: string[] | null };
    template: { name: string; body: string | null; etiquetas_envio?: string[] | null; etapa_destino_id?: string | null };
    parametros: string[];
    conversacionId?: string;
    whatsappMessageId: string | null;
  },
) {
  const { campana, pendiente, contacto, template, parametros, conversacionId, whatsappMessageId } = params;

  await supabase
    .from("campana_contactos")
    .update({ status: "enviado", enviado_at: new Date().toISOString() })
    .eq("id", pendiente.id);

  let etiquetas = contacto.etiquetas ?? [];
  if (campana.etiqueta_id) {
    const { data: etiqueta } = await supabase
      .from("etiquetas")
      .select("nombre")
      .eq("id", campana.etiqueta_id)
      .maybeSingle();
    if (etiqueta && !etiquetas.includes(etiqueta.nombre)) {
      etiquetas = [...etiquetas, etiqueta.nombre];
    }
  }

  // Etiquetas adicionales configuradas en la propia plantilla (pestaña
  // "Etiquetas" del asistente) -- se suman a la de la campaña, no la
  // reemplazan.
  for (const nombreEtiqueta of template.etiquetas_envio ?? []) {
    if (!etiquetas.includes(nombreEtiqueta)) etiquetas = [...etiquetas, nombreEtiqueta];
  }

  await supabase
    .from("contactos")
    .update({ etiquetas, campana_status: "enviado", canal_origen: "campaña" })
    .eq("id", contacto.id);

  await supabase.from("mensajes").insert({
    cuenta_id: campana.cuenta_id,
    campana_id: campana.id,
    conversacion_id: conversacionId ?? null,
    contacto_id: contacto.id,
    direccion: "saliente",
    tipo: "template",
    contenido: sustituirParametrosPlantilla(template.body, parametros),
    template_nombre: template.name,
    status: "enviado",
    whatsapp_message_id: whatsappMessageId,
  });

  // Etapa destino configurada en la plantilla ("Etapa" del asistente): si el
  // contacto tiene un deal abierto, se mueve automáticamente al enviar.
  if (template.etapa_destino_id) {
    const deal = await obtenerDealAbiertoDeContacto(supabase, contacto.id);
    if (deal) {
      await moverDealEtapa(supabase, {
        dealId: deal.id,
        cuentaId: campana.cuenta_id,
        etapaId: template.etapa_destino_id,
        perfilId: null,
        detallesExtra: { origen: "envio_plantilla", plantilla: template.name },
      });
    }
  }
}

async function registrarEnvioFallido(
  supabase: AdminClient,
  params: {
    campana: { id: string; cuenta_id: string };
    pendiente: { id: string };
    contacto: { id: string };
    template: { name: string; body: string | null };
    parametros: string[];
    conversacionId?: string;
  },
) {
  const { campana, pendiente, contacto, template, parametros, conversacionId } = params;

  await supabase.from("campana_contactos").update({ status: "fallido" }).eq("id", pendiente.id);
  await supabase.from("contactos").update({ campana_status: "fallido" }).eq("id", contacto.id);
  await supabase.from("mensajes").insert({
    cuenta_id: campana.cuenta_id,
    campana_id: campana.id,
    conversacion_id: conversacionId ?? null,
    contacto_id: contacto.id,
    direccion: "saliente",
    tipo: "template",
    contenido: sustituirParametrosPlantilla(template.body, parametros),
    template_nombre: template.name,
    status: "fallido",
  });
}

async function finalizarCampana(supabase: AdminClient, campanaId: string) {
  const { count } = await supabase
    .from("campana_contactos")
    .select("id", { count: "exact", head: true })
    .eq("campana_id", campanaId)
    .eq("status", "enviado");

  await supabase
    .from("campanas")
    .update({ status: "enviada", total_enviados: count ?? 0 })
    .eq("id", campanaId);

  return { campana_id: campanaId, finalizada: true, total_enviados: count ?? 0 };
}
