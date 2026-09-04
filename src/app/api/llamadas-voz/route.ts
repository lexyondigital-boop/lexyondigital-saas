import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverCuentaRetell, crearLlamadaRetell, telefonoAE164 } from "@/lib/retell";

// Dispara una llamada manual con una plantilla de voz desde una
// conversación abierta -- mismo espíritu que /api/messages/send con
// tipo "template", pero para Retell en vez de WhatsApp.
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { conversacion_id, plantilla_voz_id } = (await request.json()) as {
    conversacion_id?: string;
    plantilla_voz_id?: string;
  };

  if (!conversacion_id || !plantilla_voz_id) {
    return NextResponse.json({ error: "Falta conversacion_id o plantilla_voz_id" }, { status: 400 });
  }

  // Pasa por RLS con la sesión del usuario: si la conversación no
  // pertenece a su cuenta, simplemente no aparece.
  const { data: conversacion, error: conversacionError } = await supabase
    .from("conversaciones")
    .select("id, cuenta_id, telefono, contacto_id")
    .eq("id", conversacion_id)
    .single();

  if (conversacionError || !conversacion) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const admin = createAdminClient();

  const { data: plantilla } = await admin
    .from("plantillas_voz")
    .select("id, publicada")
    .eq("id", plantilla_voz_id)
    .eq("cuenta_id", conversacion.cuenta_id)
    .maybeSingle();

  if (!plantilla || !plantilla.publicada) {
    return NextResponse.json({ error: "Plantilla de voz no encontrada o no publicada" }, { status: 400 });
  }

  const cuentaRetell = await resolverCuentaRetell(admin, conversacion.cuenta_id);
  if ("error" in cuentaRetell) {
    return NextResponse.json({ error: cuentaRetell.error }, { status: 409 });
  }

  const { data: llamada, error: llamadaError } = await admin
    .from("llamadas_voz")
    .insert({
      cuenta_id: conversacion.cuenta_id,
      contacto_id: conversacion.contacto_id,
      conversacion_id: conversacion.id,
      plantilla_voz_id: plantilla.id,
      status: "en_progreso",
    })
    .select()
    .single();

  if (llamadaError) return NextResponse.json({ error: llamadaError.message }, { status: 500 });

  const resultado = await crearLlamadaRetell(cuentaRetell.apiKey, {
    fromNumber: cuentaRetell.numeroSaliente,
    toNumber: telefonoAE164(conversacion.telefono),
    metadata: { cuenta_id: conversacion.cuenta_id, llamada_voz_id: llamada.id },
  });

  if (!resultado.ok) {
    await admin.from("llamadas_voz").update({ status: "fallida", actualizado_at: new Date().toISOString() }).eq("id", llamada.id);
    return NextResponse.json({ error: resultado.error }, { status: 502 });
  }

  await admin.from("llamadas_voz").update({ retell_call_id: resultado.callId }).eq("id", llamada.id);

  return NextResponse.json({ ok: true, llamada_id: llamada.id });
}
