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
  const value = entry?.changes?.[0]?.value;

  // Los eventos de status (entregado/leído) no traen "messages" — se
  // descartan aquí, igual que el nodo "If" del workflow original.
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
      .select("id")
      .single();
    contacto = data;
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
    await enviarSaludoBienvenida({
      supabase,
      cuentaWhatsappId: cuentaWhatsapp.id,
      cuentaId: cuentaWhatsapp.cuenta_id,
      phoneNumberId: cuentaWhatsapp.phone_number_id,
      telefono,
      nombre,
    });
    // Al primer contacto se le manda el saludo fijo de arriba, no la IA.
    return;
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
    .select("id")
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

async function enviarSaludoBienvenida({
  supabase,
  cuentaWhatsappId,
  cuentaId,
  phoneNumberId,
  telefono,
  nombre,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  cuentaWhatsappId: string;
  cuentaId: string;
  phoneNumberId: string;
  telefono: string;
  nombre: string;
}) {
  const { data: credencial } = await supabase
    .from("whatsapp_credenciales")
    .select("access_token")
    .eq("cuenta_whatsapp_id", cuentaWhatsappId)
    .maybeSingle();

  if (!credencial) {
    console.error(`Cuenta ${cuentaId}: no tiene whatsapp_credenciales para saludar a un contacto nuevo.`);
    return;
  }

  const { data: agenteConfig } = await supabase
    .from("agente_config")
    .select("nombre")
    .eq("cuenta_id", cuentaId)
    .maybeSingle();

  const nombreAgente = agenteConfig?.nombre || "el equipo";
  const saludoNombre = nombre ? `Hola ${nombre}` : "Hola";

  const resultado = await enviarMensajeTexto({
    phoneNumberId,
    accessToken: credencial.access_token,
    to: normalizarDestinatario(telefono),
    texto: `${saludoNombre}, soy ${nombreAgente}. ¿En qué te puedo ayudar?`,
  });

  if (!resultado.ok) {
    console.error(
      `Cuenta ${cuentaId}: falló el saludo de bienvenida a ${telefono}:`,
      JSON.stringify(resultado.raw),
    );
  }
}
