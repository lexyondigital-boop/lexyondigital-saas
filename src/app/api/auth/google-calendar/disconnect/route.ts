import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { desconectarGoogleCalendar } from "@/lib/google-calendar";
import { registrarActividad } from "@/lib/auditoria";

export async function POST(request: NextRequest) {
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

  const { profesional_id } = await request.json();
  if (!profesional_id) return NextResponse.json({ error: "Falta profesional_id" }, { status: 400 });

  const esAdmin = perfil.rol === "admin" || perfil.rol === "super_admin";
  const esElMismo = perfil.profesional_id === profesional_id;
  if (!esAdmin && !esElMismo) {
    return NextResponse.json({ error: "No puedes desconectar el calendario de otro profesional" }, { status: 403 });
  }

  const { data: profesional } = await supabase.from("profesionales").select("id, cuenta_id").eq("id", profesional_id).single();
  if (!profesional || profesional.cuenta_id !== perfil.cuenta_id) {
    return NextResponse.json({ error: "Profesional no encontrado en tu cuenta" }, { status: 404 });
  }

  await desconectarGoogleCalendar(profesional_id);

  await registrarActividad({
    cuentaId: perfil.cuenta_id,
    perfilId: user.id,
    accion: "disconnect_google_calendar",
    recursoTipo: "profesional",
    recursoId: profesional_id,
    request,
  });

  return NextResponse.json({ ok: true });
}
