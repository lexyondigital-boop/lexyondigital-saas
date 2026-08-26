import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarMensajeTexto, normalizarDestinatario } from "@/lib/meta";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { conversacion_id, texto } = await request.json();

  if (!conversacion_id || typeof texto !== "string" || !texto.trim()) {
    return NextResponse.json({ error: "Falta conversacion_id o texto" }, { status: 400 });
  }

  // Esta consulta pasa por RLS con la sesión del usuario: si la conversación
  // no pertenece a su cuenta, simplemente no aparece — así queda validado
  // el acceso sin lógica extra.
  const { data: conversacion, error: conversacionError } = await supabase
    .from("conversaciones")
    .select("id, cuenta_id, telefono")
    .eq("id", conversacion_id)
    .single();

  if (conversacionError || !conversacion) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  // A partir de aquí se usa el cliente admin: necesitamos leer el
  // access_token de Meta, que las políticas RLS no deben exponer a
  // consultas arbitrarias del cliente.
  const admin = createAdminClient();

  const { data: cuentaWhatsapp } = await admin
    .from("cuentas_whatsapp")
    .select("id, phone_number_id")
    .eq("cuenta_id", conversacion.cuenta_id)
    .eq("estado", "activo")
    .maybeSingle();

  if (!cuentaWhatsapp) {
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

  const resultado = await enviarMensajeTexto({
    phoneNumberId: cuentaWhatsapp.phone_number_id,
    accessToken: credencial.access_token,
    to: normalizarDestinatario(conversacion.telefono),
    texto,
  });

  const { data: mensaje, error: mensajeError } = await supabase
    .from("mensajes")
    .insert({
      cuenta_id: conversacion.cuenta_id,
      conversacion_id: conversacion.id,
      direccion: "saliente",
      tipo: "texto",
      contenido: texto,
      status: resultado.ok ? "enviado" : "fallido",
      whatsapp_message_id: resultado.whatsappMessageId,
    })
    .select()
    .single();

  if (mensajeError) {
    return NextResponse.json({ error: mensajeError.message }, { status: 500 });
  }

  if (!resultado.ok) {
    return NextResponse.json({ error: "Meta rechazó el envío", mensaje }, { status: 502 });
  }

  return NextResponse.json({ ok: true, mensaje });
}
