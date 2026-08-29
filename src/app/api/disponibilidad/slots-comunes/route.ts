import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { obtenerOcupacionGoogle } from "@/lib/google-calendar";
import { calcularSlotsDisponibles, calcularSlotsComunes } from "@/lib/disponibilidad";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const idsParam = request.nextUrl.searchParams.get("profesionales") ?? "";
  const ids = idsParam.split(",").filter(Boolean);
  const fechaInicio = request.nextUrl.searchParams.get("fecha_inicio");
  const fechaFin = request.nextUrl.searchParams.get("fecha_fin");
  const duracionParam = request.nextUrl.searchParams.get("duracion");

  if (ids.length === 0 || !fechaInicio || !fechaFin) {
    return NextResponse.json({ error: "Faltan profesionales, fecha_inicio o fecha_fin" }, { status: 400 });
  }

  const slotsPorProfesional: Record<string, ReturnType<typeof calcularSlotsDisponibles>> = {};

  for (const id of ids) {
    const { data: profesional } = await supabase.from("profesionales").select("*").eq("id", id).single();
    if (!profesional) continue;

    const [{ data: bloques }, { data: citas }, ocupadoGoogle] = await Promise.all([
      supabase.from("cita_bloques_tiempo").select("fecha_inicio, fecha_fin, hora_inicio, hora_fin").eq("profesional_id", id),
      supabase
        .from("citas_agendadas")
        .select("fecha, hora_inicio, hora_fin")
        .eq("profesional_id", id)
        .neq("estado", "cancelada")
        .gte("fecha", fechaInicio)
        .lte("fecha", fechaFin),
      obtenerOcupacionGoogle({ profesional, desde: new Date(`${fechaInicio}T00:00:00`), hasta: new Date(`${fechaFin}T23:59:59`) }),
    ]);

    slotsPorProfesional[id] = calcularSlotsDisponibles({
      profesional,
      bloques: bloques ?? [],
      citas: citas ?? [],
      ocupadoGoogle,
      fechaInicio,
      fechaFin,
      duracionMinutos: duracionParam ? Number(duracionParam) : undefined,
    });
  }

  return NextResponse.json({ slots: calcularSlotsComunes(slotsPorProfesional) });
}
