import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";
import { DIMENSIONES_POR_ENTIDAD, type EntidadReporte, type DimensionReporte, type AgruparFechaPor } from "@/lib/reportes";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_reportes");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json();
  const { nombre, entidad, dimension, tipo_grafico, agrupar_fecha_por, filtros } = body as {
    nombre?: string;
    entidad?: EntidadReporte;
    dimension?: DimensionReporte;
    tipo_grafico?: string;
    agrupar_fecha_por?: AgruparFechaPor | null;
    filtros?: { rango_dias?: number | null };
  };

  if (entidad && dimension && !DIMENSIONES_POR_ENTIDAD[entidad].includes(dimension)) {
    return NextResponse.json({ error: "Esa dimensión no aplica a esta entidad" }, { status: 400 });
  }

  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (nombre !== undefined) cambios.nombre = nombre.trim();
  if (entidad !== undefined) cambios.entidad = entidad;
  if (dimension !== undefined) cambios.dimension = dimension;
  if (tipo_grafico !== undefined) cambios.tipo_grafico = tipo_grafico;
  if (agrupar_fecha_por !== undefined) cambios.agrupar_fecha_por = agrupar_fecha_por;
  if (filtros !== undefined) cambios.filtros = filtros;

  const admin = createAdminClient();
  const { data, error } = await admin.from("reportes").update(cambios).eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await registrarActividad({ cuentaId: auth.perfil.cuenta_id, perfilId: auth.user.id, accion: "edit_reporte", recursoTipo: "reporte", recursoId: id, request });

  return NextResponse.json({ reporte: data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_reportes");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();
  await admin.from("reportes").delete().eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id);

  await registrarActividad({ cuentaId: auth.perfil.cuenta_id, perfilId: auth.user.id, accion: "delete_reporte", recursoTipo: "reporte", recursoId: id, request });

  return NextResponse.json({ ok: true });
}
