import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { profesional_id, fecha_inicio, fecha_fin, hora_inicio, hora_fin, razon } = await request.json();

  if (!profesional_id || !fecha_inicio || !fecha_fin || !hora_inicio || !hora_fin) {
    return NextResponse.json({ error: "Faltan datos del bloqueo" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("cita_bloques_tiempo")
    .insert({ profesional_id, fecha_inicio, fecha_fin, hora_inicio, hora_fin, razon: razon ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bloque: data });
}
