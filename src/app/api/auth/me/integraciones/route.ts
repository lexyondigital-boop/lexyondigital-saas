import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { googleCalendarConfigurado } from "@/lib/google-calendar";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase.from("perfiles").select("es_profesional, profesional_id").eq("id", user.id).single();

  if (!perfil?.es_profesional || !perfil.profesional_id) {
    return NextResponse.json({ es_profesional: false, disponible: googleCalendarConfigurado() });
  }

  const { data: profesional } = await supabase
    .from("profesionales")
    .select("id, google_oauth_email, google_calendar_name, google_oauth_connected_at, google_oauth_expires_at, last_token_refresh")
    .eq("id", perfil.profesional_id)
    .single();

  return NextResponse.json({
    es_profesional: true,
    profesional_id: perfil.profesional_id,
    disponible: googleCalendarConfigurado(),
    google_calendar: profesional?.google_oauth_email
      ? {
          connected: true,
          email: profesional.google_oauth_email,
          calendar_name: profesional.google_calendar_name,
          connected_at: profesional.google_oauth_connected_at,
          last_refresh: profesional.last_token_refresh,
        }
      : { connected: false },
  });
}
