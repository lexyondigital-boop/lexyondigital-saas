import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { resolverCuentaRetell, crearLlamadaRetell, telefonoAE164 } from "@/lib/retell";

// Historial de llamadas para el panel de Agentes de Voz.
export async function GET() {
  const auth = await requirePermiso("view_agentes_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("llamadas_voz")
    .select(
      "id, status, resultado, duracion_segundos, transcripcion, audio_url, created_at, contacto:contactos(nombre, telefono), plantilla:plantillas_voz(nombre)"
    )
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ llamadas: data ?? [] });
}

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
    .select("id, publicada, retell_agent_id")
    .eq("id", plantilla_voz_id)
    .eq("cuenta_id", conversacion.cuenta_id)
    .maybeSingle();

  if (!plantilla || !plantilla.publicada) {
    return NextResponse.json({ error: "Plantilla de voz no encontrada o no publicada" }, { status: 400 });
  }
  if (!plantilla.retell_agent_id) {
    return NextResponse.json({ error: "Esta plantilla todavía no tiene un agente de Retell configurado" }, { status: 409 });
  }

  const cuentaRetell = await resolverCuentaRetell(admin, conversacion.cuenta_id);
  if ("error" in cuentaRetell) {
    return NextResponse.json({ error: cuentaRetell.error }, { status: 409 });
  }

  if (conversacion.contacto_id) {
    const desde = new Date(Date.now() - cuentaRetell.intervaloMinimoLlamadas * 60_000).toISOString();
    const { data: llamadaReciente } = await admin
      .from("llamadas_voz")
      .select("id")
      .eq("contacto_id", conversacion.contacto_id)
      .gte("created_at", desde)
      .limit(1)
      .maybeSingle();
    if (llamadaReciente) {
      return NextResponse.json(
        { error: `Espera al menos ${cuentaRetell.intervaloMinimoLlamadas} minutos antes de volver a llamar a este contacto` },
        { status: 429 },
      );
    }
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
    overrideAgentId: plantilla.retell_agent_id,
  });

  if (!resultado.ok) {
    await admin.from("llamadas_voz").update({ status: "fallida", actualizado_at: new Date().toISOString() }).eq("id", llamada.id);
    return NextResponse.json({ error: resultado.error }, { status: 502 });
  }

  await admin.from("llamadas_voz").update({ retell_call_id: resultado.callId }).eq("id", llamada.id);

  return NextResponse.json({ ok: true, llamada_id: llamada.id });
}
