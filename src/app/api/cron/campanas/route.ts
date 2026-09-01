import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarMensajePlantilla, normalizarDestinatario } from "@/lib/meta";
import { moverDealEtapa, obtenerDealAbiertoDeContacto } from "@/lib/deals";
import { resolverParametrosPlantilla } from "@/lib/variables-contacto";

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
    .select("id, cuenta_id, template_id, etiqueta_id")
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
  campana: { id: string; cuenta_id: string; template_id: string | null; etiqueta_id: string | null },
) {
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

  if (!campana.template_id) {
    return { campana_id: campana.id, error: "La campaña no tiene plantilla asignada" };
  }

  const { data: template } = await supabase
    .from("templates")
    .select("name, language, status, body, etiquetas_envio, etapa_destino_id, variables, variables_mapeo")
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
  });

  if (resultado.ok) {
    await registrarEnvioExitoso(supabase, { campana, pendiente, contacto, template, conversacionId: conversacion?.id, whatsappMessageId: resultado.whatsappMessageId });
  } else {
    console.error(`Campaña ${campana.id}, contacto ${contacto.id}: falló el envío:`, JSON.stringify(resultado.raw));
    await registrarEnvioFallido(supabase, { campana, pendiente, contacto, template, conversacionId: conversacion?.id });
  }

  return { campana_id: campana.id, contacto_id: contacto.id, ok: resultado.ok };
}

async function registrarEnvioExitoso(
  supabase: AdminClient,
  params: {
    campana: { id: string; cuenta_id: string; etiqueta_id: string | null };
    pendiente: { id: string };
    contacto: { id: string; etiquetas: string[] | null };
    template: { name: string; body: string | null; etiquetas_envio?: string[] | null; etapa_destino_id?: string | null };
    conversacionId?: string;
    whatsappMessageId: string | null;
  },
) {
  const { campana, pendiente, contacto, template, conversacionId, whatsappMessageId } = params;

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
    contenido: template.body,
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
    conversacionId?: string;
  },
) {
  const { campana, pendiente, contacto, template, conversacionId } = params;

  await supabase.from("campana_contactos").update({ status: "fallido" }).eq("id", pendiente.id);
  await supabase.from("contactos").update({ campana_status: "fallido" }).eq("id", contacto.id);
  await supabase.from("mensajes").insert({
    cuenta_id: campana.cuenta_id,
    campana_id: campana.id,
    conversacion_id: conversacionId ?? null,
    contacto_id: contacto.id,
    direccion: "saliente",
    tipo: "template",
    contenido: template.body,
    template_nombre: template.name,
    status: "fallido",
  });
}

async function obtenerOCrearConversacion(
  supabase: AdminClient,
  cuentaId: string,
  contactoId: string,
  telefono: string,
) {
  const { data: existente } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("contacto_id", contactoId)
    .eq("status", "abierta")
    .maybeSingle();

  if (existente) return existente;

  const { data: nueva } = await supabase
    .from("conversaciones")
    .insert({
      cuenta_id: cuentaId,
      contacto_id: contactoId,
      telefono,
      status: "abierta",
      agente_ia_activo: true,
      ventana_activa: false,
    })
    .select("id")
    .single();

  return nueva;
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
