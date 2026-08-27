import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarMensajeTexto, normalizarDestinatario } from "@/lib/meta";

// El agente humano decide enviar la sugerencia de IA (tal cual o editada).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const { texto } = await request.json();

  if (!texto?.trim()) {
    return NextResponse.json({ error: "Falta el texto a enviar" }, { status: 400 });
  }

  // Pasa por RLS con la sesión: si el mensaje no es de la cuenta del
  // usuario, simplemente no aparece.
  const { data: mensajeOriginal, error: mensajeError } = await supabase
    .from("mensajes")
    .select("id, cuenta_id, conversacion_id, contacto_id, sugerencia_ia, sugerencia_usada")
    .eq("id", id)
    .single();

  if (mensajeError || !mensajeOriginal) {
    return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });
  }

  if (!mensajeOriginal.sugerencia_ia) {
    return NextResponse.json({ error: "Este mensaje no tiene una sugerencia de IA" }, { status: 400 });
  }

  if (mensajeOriginal.sugerencia_usada) {
    return NextResponse.json({ error: "Esta sugerencia ya fue usada o descartada" }, { status: 409 });
  }

  const admin = createAdminClient();

  const { data: conversacion } = await admin
    .from("conversaciones")
    .select("telefono")
    .eq("id", mensajeOriginal.conversacion_id)
    .single();

  const { data: cuentaWhatsapp } = await admin
    .from("cuentas_whatsapp")
    .select("id, phone_number_id")
    .eq("cuenta_id", mensajeOriginal.cuenta_id)
    .eq("estado", "activo")
    .maybeSingle();

  if (!conversacion || !cuentaWhatsapp) {
    return NextResponse.json({ error: "Esta cuenta no tiene WhatsApp conectado" }, { status: 409 });
  }

  const { data: credencial } = await admin
    .from("whatsapp_credenciales")
    .select("access_token")
    .eq("cuenta_whatsapp_id", cuentaWhatsapp.id)
    .maybeSingle();

  if (!credencial) {
    return NextResponse.json({ error: "Falta la credencial de WhatsApp de la cuenta" }, { status: 409 });
  }

  const textoFinal = texto.trim();
  const editado = textoFinal !== mensajeOriginal.sugerencia_ia;

  const resultado = await enviarMensajeTexto({
    phoneNumberId: cuentaWhatsapp.phone_number_id,
    accessToken: credencial.access_token,
    to: normalizarDestinatario(conversacion.telefono),
    texto: textoFinal,
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: "Meta rechazó el envío" }, { status: 502 });
  }

  await Promise.all([
    supabase
      .from("mensajes")
      .update({ sugerencia_usada: true, ...(editado ? { editado_humano: textoFinal } : {}) })
      .eq("id", id),
    supabase.from("mensajes").insert({
      cuenta_id: mensajeOriginal.cuenta_id,
      conversacion_id: mensajeOriginal.conversacion_id,
      contacto_id: mensajeOriginal.contacto_id,
      direccion: "saliente",
      tipo: "texto",
      contenido: textoFinal,
      status: "enviado",
      whatsapp_message_id: resultado.whatsappMessageId,
    }),
  ]);

  return NextResponse.json({ ok: true });
}
