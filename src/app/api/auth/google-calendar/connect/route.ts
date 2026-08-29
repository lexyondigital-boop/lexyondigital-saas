import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { construirAuthUrl, googleCalendarConfigurado } from "@/lib/google-calendar";
import { origenPublico } from "@/lib/origen-publico";

export async function POST(request: NextRequest) {
  if (!googleCalendarConfigurado()) {
    return NextResponse.json({ error: "Google Calendar todavía no está configurado en la plataforma" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol, cuenta_id, profesional_id")
    .eq("id", user.id)
    .single();
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });

  const { profesional_id, volver_a } = await request.json();
  if (!profesional_id) return NextResponse.json({ error: "Falta profesional_id" }, { status: 400 });

  const esAdmin = perfil.rol === "admin" || perfil.rol === "super_admin";
  const esElMismo = perfil.profesional_id === profesional_id;
  if (!esAdmin && !esElMismo) {
    return NextResponse.json({ error: "No puedes conectar el calendario de otro profesional" }, { status: 403 });
  }

  const { data: profesional } = await supabase.from("profesionales").select("id, cuenta_id").eq("id", profesional_id).single();
  if (!profesional || profesional.cuenta_id !== perfil.cuenta_id) {
    return NextResponse.json({ error: "Profesional no encontrado en tu cuenta" }, { status: 404 });
  }

  const redirectUri = `${origenPublico(request)}/api/auth/google-calendar/callback`;
  const url = construirAuthUrl({
    redirectUri,
    estado: {
      profesionalId: profesional_id,
      cuentaId: perfil.cuenta_id,
      volverA: typeof volver_a === "string" ? volver_a : "/profesionales",
      ts: Date.now(),
    },
  });

  return NextResponse.json({ url });
}
