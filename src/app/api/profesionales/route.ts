import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const especialidad = request.nextUrl.searchParams.get("especialidad");
  const search = request.nextUrl.searchParams.get("search");

  let query = supabase
    .from("profesionales")
    .select(
      "id, perfil_id, nombre, especialidad, email, telefono, color_agenda, estado, duracion_cita_minutos, horario_inicio, horario_fin, google_oauth_email, google_calendar_name, google_oauth_connected_at, created_at",
    )
    .order("nombre");

  if (especialidad) query = query.eq("especialidad", especialidad);
  if (search) query = query.or(`nombre.ilike.%${search}%,especialidad.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ profesionales: data });
}
