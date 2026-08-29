import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const profesionalId = request.nextUrl.searchParams.get("profesional_id");
  const fechaInicio = request.nextUrl.searchParams.get("fecha_inicio");
  const fechaFin = request.nextUrl.searchParams.get("fecha_fin");
  const estado = request.nextUrl.searchParams.get("estado");

  let query = supabase
    .from("citas_agendadas")
    .select("*, contactos(nombre, nombre_completo, telefono), profesionales(nombre, especialidad, color_agenda)")
    .order("fecha", { ascending: true })
    .order("hora_inicio", { ascending: true });

  if (profesionalId) query = query.eq("profesional_id", profesionalId);
  if (fechaInicio) query = query.gte("fecha", fechaInicio);
  if (fechaFin) query = query.lte("fecha", fechaFin);
  if (estado) query = query.eq("estado", estado);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ citas: data });
}
