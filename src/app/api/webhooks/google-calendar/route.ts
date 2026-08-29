import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarCitasDesdeGoogle } from "@/lib/google-calendar-sync";

// Google llama aquí (sin auth de Supabase -- no es un usuario, es su propio
// servidor) cada vez que algo cambia en un calendario al que nos suscribimos
// con events.watch. El body viene vacío; todo lo importante va en headers.
// Google espera un 200 rápido, así que nunca se le regresa error aquí --
// cualquier cosa rara (canal desconocido, token que no coincide) se ignora
// en silencio en vez de fallar.
export async function POST(request: NextRequest) {
  const channelId = request.headers.get("x-goog-channel-id");
  const resourceState = request.headers.get("x-goog-resource-state");
  const token = request.headers.get("x-goog-channel-token");

  if (!channelId) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const { data: profesional } = await admin
    .from("profesionales")
    .select("id, google_channel_token")
    .eq("google_channel_id", channelId)
    .maybeSingle();

  if (!profesional || profesional.google_channel_token !== token) {
    return NextResponse.json({ ok: true });
  }

  // "sync" es solo la confirmación inicial de que el canal quedó activo --
  // no hay nada que sincronizar todavía.
  if (resourceState === "sync") {
    return NextResponse.json({ ok: true });
  }

  await sincronizarCitasDesdeGoogle(profesional.id);

  return NextResponse.json({ ok: true });
}
