import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarMensajeTexto, normalizarDestinatario } from "@/lib/meta";
import { procesarAgenteIA } from "@/lib/agente-ia-runtime";
import { descargarYGuardarMedia } from "@/lib/media-whatsapp";
import { transcribirAudio } from "@/lib/transcripcion";
import { resolverLlaveDePlataforma } from "@/lib/plataforma-secretos";

// Verificación de webhook de Meta. A diferencia del workflow de n8n que
// reemplaza (que respondía el hub.challenge sin validar nada), aquí sí se
// exige que hub.verify_token coincida con META_WEBHOOK_VERIFY_TOKEN.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Responder 200 de inmediato: Meta reintenta el webhook si no recibe
  // respuesta rápido, y no necesita esperar a que terminemos de procesar.
  procesarMensajeEntrante(body).catch((error) => {
    console.error("Error procesando webhook de WhatsApp:", error);
  });

  return NextResponse.json({ ok: true });
}

async function procesarMensajeEntrante(body: unknown) {
  const entry = (body as any)?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  // Meta manda esto por separado de mensajes/estados cuando una plantilla
  // sometida cambia de status (aprobada, rechazada, pausada, deshabilitada).
  // Se revisa el campo explícito -- a diferencia de "statuses"/"messages" de
  // abajo, que se distinguen por forma, este evento no siempre trae el
  // mismo shape que uno pueda adivinar de forma confiable.
  if (change?.field === "message_template_status_update") {
    await procesarActualizacionPlantilla(value);
    return;
  }

  // Los eventos de "statuses" (enviado/entregado/leído/fallido de un mensaje
  // saliente) llegan aparte de los de "messages" -- se procesan para poder
  // mostrar las palomitas reales en el chat, no solo un estado fijo al
  // momento de mandar el mensaje.
  if (value?.statuses) {
    await procesarActualizacionesEstado(value.statuses);
    return;
  }

  if (!value?.messages) return;

  const mensaje = value.messages[0];
  const contactoMeta = value.contacts?.[0];
  const phoneNumberId: string | undefined = value.metadata?.phone_number_id;

  if (!phoneNumberId || !["text", "audio", "image"].includes(mensaje.type)) return;

  const supabase = createAdminClient();

  const { data: cuentaWhatsapp } = await supabase
    .from("cuentas_whatsapp")
    .select("id, cuenta_id, phone_number_id")
    .eq("phone_number_id", phoneNumberId)
    .eq("estado", "activo")
    .maybeSingle();

  if (!cuentaWhatsapp) {
    console.error(
      `Webhook de WhatsApp recibido para phone_number_id ${phoneNumberId} sin ninguna cuenta activa registrada.`,
    );
    return;
  }

  const { data: credencial } = await supabase
    .from("whatsapp_credenciales")
    .select("access_token")
    .eq("cuenta_whatsapp_id", cuentaWhatsapp.id)
    .maybeSingle();

  const contenidoMensaje = credencial
    ? await interpretarMensaje(supabase, mensaje, cuentaWhatsapp.cuenta_id, credencial.access_token)
    : null;

  if (!contenidoMensaje) {
    if (!credencial) console.error(`Cuenta ${cuentaWhatsapp.cuenta_id}: sin whatsapp_credenciales, no se pudo procesar el medio.`);
    return;
  }

  const telefono: string = mensaje.from;
  const nombre: string = contactoMeta?.profile?.name ?? "";

  let contacto = await buscarContacto(supabase, cuentaWhatsapp.cuenta_id, telefono);
  const esContactoNuevo = !contacto;

  if (!contacto) {
    const { data } = await supabase
      .from("contactos")
      .insert({ cuenta_id: cuentaWhatsapp.cuenta_id, telefono, nombre, status: "activo" })
      .select("id, campana_status")
      .single();
    contacto = data;
  } else if (["enviado", "entregado", "leido"].includes(contacto.campana_status ?? "")) {
    // El contacto ya estaba en una campaña (se le mandó algo y no había
    // contestado) -- al escribir, pasa a "respondió", el estado más
    // avanzado de campana_status (ver RANGO_CAMPANA_STATUS más abajo).
    await supabase.from("contactos").update({ campana_status: "respondio" }).eq("id", contacto.id);
  }

  if (!contacto) return;

  const conversacion = await obtenerOCrearConversacion(
    supabase,
    cuentaWhatsapp.cuenta_id,
    contacto.id,
    telefono,
  );

  const { data: mensajeInsertado } = await supabase
    .from("mensajes")
    .insert({
      cuenta_id: cuentaWhatsapp.cuenta_id,
      conversacion_id: conversacion?.id ?? null,
      contacto_id: contacto.id,
      direccion: "entrante",
      tipo: contenidoMensaje.tipo,
      contenido: contenidoMensaje.contenido,
      media_url: contenidoMensaje.mediaUrl,
      media_mime_type: contenidoMensaje.mediaMimeType,
      whatsapp_message_id: mensaje.id,
      status: "entregado",
    })
    .select("id")
    .single();

  if (esContactoNuevo) {
    const { data: agenteConfig } = await supabase
      .from("agente_config")
      .select("activo, enviar_bienvenida_inactivo, mensaje_bienvenida_inactivo")
      .eq("cuenta_id", cuentaWhatsapp.cuenta_id)
      .maybeSingle();

    // Si el agente está activo, el primer mensaje lo responde la IA como
    // cualquier otro (sigue el flujo normal más abajo) -- el saludo fijo de
    // aquí es solo un respaldo para cuando no hay IA respondiendo.
    if (!agenteConfig?.activo) {
      if (agenteConfig?.enviar_bienvenida_inactivo && agenteConfig.mensaje_bienvenida_inactivo) {
        await enviarBienvenidaAgenteInactivo({
          supabase,
          cuentaWhatsappId: cuentaWhatsapp.id,
          cuentaId: cuentaWhatsapp.cuenta_id,
          phoneNumberId: cuentaWhatsapp.phone_number_id,
          conversacionId: conversacion?.id ?? null,
          contactoId: contacto.id,
          telefono,
          nombre,
          mensaje: agenteConfig.mensaje_bienvenida_inactivo,
        });
      }
      return;
    }
  }

  if (conversacion?.id && mensajeInsertado && contenidoMensaje.disparaAgente && contenidoMensaje.contenido) {
    await procesarAgenteIA({
      cuentaId: cuentaWhatsapp.cuenta_id,
      conversacionId: conversacion.id,
      contactoId: contacto.id,
      telefono,
      mensajeEntranteId: mensajeInsertado.id,
      textoEntrante: contenidoMensaje.contenido,
    }).catch((error) => console.error(`Cuenta ${cuentaWhatsapp.cuenta_id}: error en el agente IA:`, error));
  }
}

type ContenidoMensaje = {
  tipo: "texto" | "audio" | "imagen";
  contenido: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  // Falso para imágenes sin texto/caption -- no tiene caso mandarle al
  // agente un mensaje vacío, se deja solo visible para que un humano lo vea.
  disparaAgente: boolean;
};

async function interpretarMensaje(
  supabase: ReturnType<typeof createAdminClient>,
  mensaje: any,
  cuentaId: string,
  accessToken: string,
): Promise<ContenidoMensaje | null> {
  if (mensaje.type === "text") {
    const texto = mensaje.text?.body ?? "";
    return { tipo: "texto", contenido: texto, mediaUrl: null, mediaMimeType: null, disparaAgente: true };
  }

  if (mensaje.type === "audio") {
    const descarga = await descargarYGuardarMedia({ mediaId: mensaje.audio.id, accessToken, cuentaId });
    if (!descarga.ok) {
      console.error(`Cuenta ${cuentaId}: no se pudo descargar el audio de WhatsApp:`, descarga.error);
      return { tipo: "audio", contenido: "[No se pudo procesar el audio]", mediaUrl: null, mediaMimeType: null, disparaAgente: false };
    }

    const apiKeyOpenAi = await resolverLlaveDePlataforma(supabase, "openai");
    if (!apiKeyOpenAi) {
      console.error(`Cuenta ${cuentaId}: falta la API key de plataforma de OpenAI para transcribir audio.`);
      return { tipo: "audio", contenido: "[No se pudo transcribir el audio]", mediaUrl: descarga.url, mediaMimeType: descarga.mimeType, disparaAgente: false };
    }

    const transcripcion = await transcribirAudio({
      audioBuffer: descarga.datos!,
      mimeType: descarga.mimeType ?? "audio/ogg",
      apiKey: apiKeyOpenAi,
    });

    if (!transcripcion.ok || !transcripcion.texto) {
      console.error(`Cuenta ${cuentaId}: no se pudo transcribir el audio:`, transcripcion.error);
      return { tipo: "audio", contenido: "[No se pudo transcribir el audio]", mediaUrl: descarga.url, mediaMimeType: descarga.mimeType, disparaAgente: false };
    }

    return { tipo: "audio", contenido: transcripcion.texto, mediaUrl: descarga.url, mediaMimeType: descarga.mimeType, disparaAgente: true };
  }

  if (mensaje.type === "image") {
    const descarga = await descargarYGuardarMedia({ mediaId: mensaje.image.id, accessToken, cuentaId });
    if (!descarga.ok) {
      console.error(`Cuenta ${cuentaId}: no se pudo descargar la imagen de WhatsApp:`, descarga.error);
      return null;
    }

    const caption: string | null = mensaje.image?.caption ?? null;
    return { tipo: "imagen", contenido: caption, mediaUrl: descarga.url, mediaMimeType: descarga.mimeType, disparaAgente: !!caption };
  }

  return null;
}

async function buscarContacto(
  supabase: ReturnType<typeof createAdminClient>,
  cuentaId: string,
  telefono: string,
) {
  const { data } = await supabase
    .from("contactos")
    .select("id, campana_status")
    .eq("cuenta_id", cuentaId)
    .eq("telefono", telefono)
    .maybeSingle();
  return data;
}

async function obtenerOCrearConversacion(
  supabase: ReturnType<typeof createAdminClient>,
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
      ventana_activa: true,
    })
    .select("id")
    .single();

  return nueva;
}

async function enviarBienvenidaAgenteInactivo({
  supabase,
  cuentaWhatsappId,
  cuentaId,
  phoneNumberId,
  conversacionId,
  contactoId,
  telefono,
  nombre,
  mensaje,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  cuentaWhatsappId: string;
  cuentaId: string;
  phoneNumberId: string;
  conversacionId: string | null;
  contactoId: string;
  telefono: string;
  nombre: string;
  mensaje: string;
}) {
  const { data: credencial } = await supabase
    .from("whatsapp_credenciales")
    .select("access_token")
    .eq("cuenta_whatsapp_id", cuentaWhatsappId)
    .maybeSingle();

  if (!credencial) {
    console.error(`Cuenta ${cuentaId}: no tiene whatsapp_credenciales para la bienvenida de agente inactivo.`);
    return;
  }

  // {nombre} es opcional en el mensaje configurado -- si el contacto no
  // trajo nombre de perfil de WhatsApp, se limpia la coma/espacio que haya
  // quedado colgando en vez de mandar "Hola , gracias...".
  const texto = mensaje
    .replace(/\{nombre\}/gi, nombre.trim())
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();

  const resultado = await enviarMensajeTexto({
    phoneNumberId,
    accessToken: credencial.access_token,
    to: normalizarDestinatario(telefono),
    texto,
  });

  if (!resultado.ok) {
    console.error(
      `Cuenta ${cuentaId}: falló la bienvenida de agente inactivo a ${telefono}:`,
      JSON.stringify(resultado.raw),
    );
  }

  const { error } = await supabase.from("mensajes").insert({
    cuenta_id: cuentaId,
    conversacion_id: conversacionId,
    contacto_id: contactoId,
    direccion: "saliente",
    tipo: "texto",
    contenido: texto,
    status: resultado.ok ? "enviado" : "fallido",
    whatsapp_message_id: resultado.whatsappMessageId,
  });

  if (error) {
    console.error(`Cuenta ${cuentaId}: no se pudo guardar la bienvenida de agente inactivo en mensajes:`, error.message);
  }
}

const ESTADO_POR_META: Record<string, "enviado" | "entregado" | "leido" | "fallido"> = {
  sent: "enviado",
  delivered: "entregado",
  read: "leido",
  failed: "fallido",
};

// Progresión normal enviado -> entregado -> leido -- si llegan fuera de
// orden (raro, pero pasa) no se retrocede un estado más avanzado. "fallido"
// siempre se aplica, sin importar en qué estado estaba antes.
const RANGO_ESTADO: Record<string, number> = { enviado: 1, entregado: 2, leido: 3 };

// Mismo espíritu que RANGO_ESTADO, pero para contactos.campana_status --
// "respondio" (el contacto contestó, ver procesarMensajeEntrante) es el más
// avanzado, así que un entregado/leido que llegue tarde nunca lo pisa.
const RANGO_CAMPANA_STATUS: Record<string, number> = { pendiente: 0, enviado: 1, entregado: 2, leido: 3, respondio: 4 };

async function procesarActualizacionesEstado(statuses: any[]) {
  const supabase = createAdminClient();

  for (const s of statuses) {
    const nuevoEstado = ESTADO_POR_META[s?.status];
    if (!nuevoEstado || !s?.id) continue;

    const { data: existente } = await supabase
      .from("mensajes")
      .select("id, status, tipo, template_nombre, cuenta_id, campana_id, contacto_id")
      .eq("whatsapp_message_id", s.id)
      .maybeSingle();

    if (!existente) continue;
    if (nuevoEstado !== "fallido" && (RANGO_ESTADO[existente.status] ?? 0) >= (RANGO_ESTADO[nuevoEstado] ?? 0)) continue;

    await supabase.from("mensajes").update({ status: nuevoEstado }).eq("id", existente.id);

    if (existente.tipo === "template" && existente.template_nombre) {
      await dispararWebhookPlantilla(supabase, {
        cuentaId: existente.cuenta_id,
        nombrePlantilla: existente.template_nombre,
        estado: nuevoEstado,
        whatsappMessageId: s.id,
      });
    }

    if (existente.campana_id && existente.contacto_id && (nuevoEstado === "entregado" || nuevoEstado === "leido")) {
      const { data: contacto } = await supabase.from("contactos").select("campana_status").eq("id", existente.contacto_id).maybeSingle();
      const actual = contacto?.campana_status ?? "pendiente";
      if ((RANGO_CAMPANA_STATUS[actual] ?? 0) < (RANGO_CAMPANA_STATUS[nuevoEstado] ?? 0)) {
        await supabase.from("contactos").update({ campana_status: nuevoEstado }).eq("id", existente.contacto_id);
      }
    }
  }
}

// Notificación propia de la plataforma (no de Meta): si la plantilla tiene
// una URL de webhook configurada en la pestaña "Webhook" del asistente, se
// le avisa cuando un mensaje enviado con ella cambia de estado. Best-effort:
// nunca debe tronar el procesamiento del webhook real de Meta.
async function dispararWebhookPlantilla(
  supabase: ReturnType<typeof createAdminClient>,
  { cuentaId, nombrePlantilla, estado, whatsappMessageId }: { cuentaId: string; nombrePlantilla: string; estado: string; whatsappMessageId: string },
) {
  try {
    const { data: plantilla } = await supabase
      .from("templates")
      .select("webhook_url, webhook_headers")
      .eq("cuenta_id", cuentaId)
      .eq("name", nombrePlantilla)
      .maybeSingle();

    if (!plantilla?.webhook_url) return;

    await fetch(plantilla.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(plantilla.webhook_headers as Record<string, string> | null) },
      body: JSON.stringify({ plantilla: nombrePlantilla, estado, whatsapp_message_id: whatsappMessageId }),
    });
  } catch (error) {
    console.error(`Cuenta ${cuentaId}: falló el webhook propio de la plantilla "${nombrePlantilla}":`, error);
  }
}

const ESTADO_PLANTILLA_POR_META: Record<string, "pending" | "approved" | "rejected" | "paused" | "disabled"> = {
  APPROVED: "approved",
  REJECTED: "rejected",
  PENDING: "pending",
  PAUSED: "paused",
  DISABLED: "disabled",
  IN_APPEAL: "pending",
};

async function procesarActualizacionPlantilla(value: any) {
  const nuevoEstado = ESTADO_PLANTILLA_POR_META[value?.event];
  const metaTemplateId: string | undefined = value?.message_template_id ? String(value.message_template_id) : undefined;

  if (!nuevoEstado || !metaTemplateId) {
    console.error("Webhook de estado de plantilla con forma inesperada:", JSON.stringify(value));
    return;
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("templates")
    .update({ status: nuevoEstado, error_meta: value?.reason ?? null })
    .eq("meta_template_id", metaTemplateId);

  if (error) {
    console.error(`No se pudo actualizar el status de la plantilla ${metaTemplateId} desde el webhook:`, error.message);
  }
}
