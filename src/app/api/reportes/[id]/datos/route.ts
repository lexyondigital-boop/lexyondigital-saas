import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { calcularDatosReporte, type Reporte } from "@/lib/reportes";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("view_analytics");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: reporte } = await admin
    .from("reportes")
    .select("id, nombre, entidad, dimension, campo_personalizado_id, tipo_grafico, agrupar_fecha_por, filtros, metrica")
    .eq("id", id)
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .maybeSingle();

  if (!reporte) return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });

  // El selector de rango en cada tarjeta del dashboard sobreescribe
  // rango_dias solo para esta consulta, sin tocar la definición guardada
  // del reporte.
  const rangoOverride = new URL(request.url).searchParams.get("rango_dias");
  const reporteFinal: Reporte =
    rangoOverride !== null
      ? { ...(reporte as Reporte), filtros: { ...(reporte as Reporte).filtros, rango_dias: rangoOverride === "todo" ? null : Number(rangoOverride) } }
      : (reporte as Reporte);

  const datos = await calcularDatosReporte(admin, auth.perfil.cuenta_id, reporteFinal);

  return NextResponse.json({ datos });
}
