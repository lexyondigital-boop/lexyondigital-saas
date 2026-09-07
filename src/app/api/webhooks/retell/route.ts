import { NextRequest, NextResponse } from "next/server";
import { Retell } from "retell-sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverApiKeyRetell, mapearStatusLlamada, mapearResultadoLlamada } from "@/lib/retell";
import { obtenerOCrearConversacion } from "@/lib/conversaciones";

type CallPayload = {
  call_id: string;
  call_status: string;
  disconnection_reason?: string | null;
  transcript?: string | null;
  recording_url?: string | null;
  duration_ms?: number | null;
  call_analysis?: { call_successful?: boolean } | null;
  call_cost?: { combined_cost?: number } | null;
};

// Retell notifica aquí cuando una llamada termina (call_ended) y cuando su
// análisis está listo (call_analyzed, un poco después) -- responde 200 en
// cuanto pueda para que Retell no reintente eventos que no nos corresponden.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const firma = request.headers.get("x-retell-signature");

  let payload: { event: string; call: CallPayload };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (payload.event !== "call_ended" && payload.event !== "call_analyzed") {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  const { data: llamada } = await admin
    .from("llamadas_voz")
    .select("id, cuenta_id, contacto_id, conversacion_id")
    .eq("retell_call_id", payload.call.call_id)
    .maybeSingle();

  if (!llamada) return NextResponse.json({ ok: true });

  const apiKey = await resolverApiKeyRetell(admin, llamada.cuenta_id);
  if (!apiKey || !firma || !(await Retell.verify(rawBody, apiKey, firma))) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const call = payload.call;
  const cambios: Record<string, unknown> = {
    status: mapearStatusLlamada(call.call_status, call.disconnection_reason),
    transcripcion: call.transcript ?? null,
    audio_url: call.recording_url ?? null,
    duracion_segundos: call.duration_ms ? Math.round(call.duration_ms / 1000) : null,
    costo_retell: call.call_cost?.combined_cost ?? null,
    actualizado_at: new Date().toISOString(),
  };

  if (payload.event === "call_analyzed") {
    cambios.resultado = mapearResultadoLlamada(call.call_analysis);
  }

  await admin.from("llamadas_voz").update(cambios).eq("id", llamada.id);

  if (cambios.resultado === "acepto" && !llamada.conversacion_id && llamada.contacto_id) {
    const { data: contacto } = await admin.from("contactos").select("telefono").eq("id", llamada.contacto_id).maybeSingle();
    if (contacto) {
      const conversacion = await obtenerOCrearConversacion(admin, llamada.cuenta_id, llamada.contacto_id, contacto.telefono);
      if (conversacion) await admin.from("llamadas_voz").update({ conversacion_id: conversacion.id }).eq("id", llamada.id);
    }
  }

  return NextResponse.json({ ok: true });
}
