import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { calcularDatosReporte, type Reporte } from "@/lib/reportes";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("view_analytics");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: reporte } = await admin
    .from("reportes")
    .select("id, nombre, entidad, dimension, tipo_grafico, agrupar_fecha_por, filtros")
    .eq("id", id)
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .maybeSingle();

  if (!reporte) return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });

  const datos = await calcularDatosReporte(admin, auth.perfil.cuenta_id, reporte as Reporte);

  return NextResponse.json({ datos });
}
