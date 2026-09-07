import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";
import {
  DIMENSIONES_POR_ENTIDAD,
  TIPOS_CAMPO_REPORTABLES,
  type EntidadReporte,
  type DimensionReporte,
  type AgruparFechaPor,
  type MetricaReporte,
} from "@/lib/reportes";

const METRICAS: MetricaReporte[] = ["llamadas", "minutos", "costo"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_reportes");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json();
  const { nombre, entidad, dimension, campo_personalizado_id, tipo_grafico, agrupar_fecha_por, filtros, metrica } = body as {
    nombre?: string;
    entidad?: EntidadReporte;
    dimension?: DimensionReporte;
    campo_personalizado_id?: string | null;
    tipo_grafico?: string;
    agrupar_fecha_por?: AgruparFechaPor | null;
    filtros?: { rango_dias?: number | null; etiqueta?: string | null };
    metrica?: MetricaReporte;
  };

  if (entidad && dimension && !DIMENSIONES_POR_ENTIDAD[entidad].includes(dimension)) {
    return NextResponse.json({ error: "Esa dimensión no aplica a esta entidad" }, { status: 400 });
  }
  if (metrica !== undefined && !METRICAS.includes(metrica)) {
    return NextResponse.json({ error: "Métrica inválida" }, { status: 400 });
  }

  const admin = createAdminClient();

  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (nombre !== undefined) cambios.nombre = nombre.trim();
  if (entidad !== undefined) cambios.entidad = entidad;
  if (filtros !== undefined) cambios.filtros = filtros;
  if (tipo_grafico !== undefined) cambios.tipo_grafico = tipo_grafico;
  if (metrica !== undefined) cambios.metrica = metrica;

  if (dimension !== undefined) {
    cambios.dimension = dimension;

    if (dimension === "campo_personalizado") {
      if (!campo_personalizado_id) return NextResponse.json({ error: "Falta elegir el campo personalizado" }, { status: 400 });
      const { data: campo } = await admin
        .from("campos_personalizados")
        .select("id, tipo")
        .eq("id", campo_personalizado_id)
        .eq("cuenta_id", auth.perfil.cuenta_id)
        .maybeSingle();
      if (!campo || !TIPOS_CAMPO_REPORTABLES.includes(campo.tipo as (typeof TIPOS_CAMPO_REPORTABLES)[number])) {
        return NextResponse.json({ error: "Ese campo personalizado no se puede usar para agrupar" }, { status: 400 });
      }
      cambios.campo_personalizado_id = campo.id;
      cambios.agrupar_fecha_por = campo.tipo === "date" ? (agrupar_fecha_por ?? "dia") : null;
    } else {
      cambios.campo_personalizado_id = null;
      const esFecha = dimension === "fecha_creacion" || dimension === "fecha_modificacion";
      cambios.agrupar_fecha_por = esFecha ? (agrupar_fecha_por ?? "dia") : null;
    }
  }

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
