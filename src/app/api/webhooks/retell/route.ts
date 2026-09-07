import { NextRequest, NextResponse } from "next/server";
import { Retell } from "retell-sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverApiKeyRetell, procesarResultadoLlamadaVoz, type CallDataRetell } from "@/lib/retell";

// Retell notifica aquí cuando una llamada termina (call_ended) y cuando su
// análisis está listo (call_analyzed, un poco después) -- responde 200 en
// cuanto pueda para que Retell no reintente eventos que no nos corresponden.
// Nota: la entrega de este webhook no está garantizada -- algunas llamadas
// se quedan sin este evento (confirmado empíricamente) y las recupera
// aparte el cron de reconciliación (src/app/api/cron/llamadas-voz-reconciliar).
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const firma = request.headers.get("x-retell-signature");

  let payload: { event: string; call: CallDataRetell };
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

  await procesarResultadoLlamadaVoz(admin, llamada, payload.call, payload.event === "call_analyzed");

  return NextResponse.json({ ok: true });
}
