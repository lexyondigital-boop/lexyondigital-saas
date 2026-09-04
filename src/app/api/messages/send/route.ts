import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarMensajeTexto, enviarMensajePlantilla, normalizarDestinatario } from "@/lib/meta";
import { resolverParametrosPlantilla, sustituirParametrosPlantilla } from "@/lib/variables-contacto";
import { obtenerOCrearConversacion } from "@/lib/conversaciones";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { conversacion_id, contacto_id, tipo, texto, template_id } = body as {
    conversacion_id?: string;
    contacto_id?: string;
    tipo?: "texto" | "template";
    texto?: string;
    template_id?: string;
  };

  if (!conversacion_id && !contacto_id) {
    return NextResponse.json({ error: "Falta conversacion_id o contacto_id" }, { status: 400 });
  }
  if (tipo === "template" && !template_id) {
    return NextResponse.json({ error: "Falta template_id" }, { status: 400 });
  }
  if (tipo !== "template" && (typeof texto !== "string" || !texto.trim())) {
    return NextResponse.json({ error: "Falta texto" }, { status: 400 });
  }

  // A partir de aquí se usa el cliente admin: necesitamos leer el
  // access_token de Meta, que las políticas RLS no deben exponer a
  // consultas arbitrarias del cliente.
  const admin = createAdminClient();

  let conversacion: { id: string; cuenta_id: string; telefono: string; contacto_id: string | null };

  if (conversacion_id) {
    // Esta consulta pasa por RLS con la sesión del usuario: si la
    // conversación no pertenece a su cuenta, simplemente no aparece — así
    // queda validado el acceso sin lógica extra.
    const { data, error: conversacionError } = await supabase
      .from("conversaciones")
      .select("id, cuenta_id, telefono, contacto_id")
      .eq("id", conversacion_id)
      .single();

    if (conversacionError || !data) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }
    conversacion = data;
  } else {
    // Igual pasa por RLS: un contacto que no sea de la cuenta del usuario
    // simplemente no aparece. Se usa para el botón "Enviar plantilla" de la
    // tabla de Contactos, donde todavía no existe ninguna conversación.
    const { data: contacto, error: contactoError } = await supabase
      .from("contactos")
      .select("id, cuenta_id, telefono")
      .eq("id", contacto_id)
      .single();

    if (contactoError || !contacto) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    const nueva = await obtenerOCrearConversacion(admin, contacto.cuenta_id, contacto.id, contacto.telefono);
    if (!nueva) {
      return NextResponse.json({ error: "No se pudo abrir la conversación" }, { status: 500 });
    }
    conversacion = { id: nueva.id, cuenta_id: contacto.cuenta_id, telefono: contacto.telefono, contacto_id: contacto.id };
  }

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

  if (tipo === "template") {
    const { data: template } = await admin
      .from("templates")
      .select("name, language, status, body, variables, variables_mapeo")
      .eq("id", template_id)
      .eq("cuenta_id", conversacion.cuenta_id)
      .maybeSingle();

    if (!template || template.status !== "approved") {
      return NextResponse.json({ error: "Plantilla no aprobada o no encontrada" }, { status: 400 });
    }
    if (!conversacion.contacto_id) {
      return NextResponse.json({ error: "Esta conversación no tiene un contacto asociado" }, { status: 409 });
    }

    const parametros = await resolverParametrosPlantilla(admin, conversacion.cuenta_id, conversacion.contacto_id, template);

    const resultado = await enviarMensajePlantilla({
      phoneNumberId: cuentaWhatsapp.phone_number_id,
      accessToken: credencial.access_token,
      to: normalizarDestinatario(conversacion.telefono),
      nombrePlantilla: template.name,
      idioma: template.language,
      parametros,
    });

    const { data: mensaje, error: mensajeError } = await supabase
      .from("mensajes")
      .insert({
        cuenta_id: conversacion.cuenta_id,
        conversacion_id: conversacion.id,
        contacto_id: conversacion.contacto_id,
        direccion: "saliente",
        tipo: "template",
        contenido: sustituirParametrosPlantilla(template.body, parametros),
        template_nombre: template.name,
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

    return NextResponse.json({ ok: true, mensaje, conversacion_id: conversacion.id });
  }

  const resultado = await enviarMensajeTexto({
    phoneNumberId: cuentaWhatsapp.phone_number_id,
    accessToken: credencial.access_token,
    to: normalizarDestinatario(conversacion.telefono),
    texto: texto!,
  });

  const { data: mensaje, error: mensajeError } = await supabase
    .from("mensajes")
    .insert({
      cuenta_id: conversacion.cuenta_id,
      conversacion_id: conversacion.id,
      contacto_id: conversacion.contacto_id,
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

  return NextResponse.json({ ok: true, mensaje, conversacion_id: conversacion.id });
}
