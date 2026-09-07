import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";
import {
  DIMENSIONES_POR_ENTIDAD,
  TIPOS_CAMPO_REPORTABLES,
  type EntidadReporte,
  type DimensionReporte,
  type TipoGraficoReporte,
  type AgruparFechaPor,
  type MetricaReporte,
} from "@/lib/reportes";

const ENTIDADES: EntidadReporte[] = ["contactos", "deals", "campanas", "conversaciones", "agentes_voz"];
const TIPOS_GRAFICO: TipoGraficoReporte[] = ["barras", "dona", "linea", "numero"];
const AGRUPACIONES_FECHA: AgruparFechaPor[] = ["dia", "semana", "mes"];
const METRICAS: MetricaReporte[] = ["llamadas", "minutos", "costo"];

export async function GET() {
  const auth = await requirePermiso("view_analytics");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data, error } = await admin.from("reportes").select("*").eq("cuenta_id", auth.perfil.cuenta_id).order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reportes: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermiso("manage_reportes");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json();
  const { nombre, entidad, dimension, campo_personalizado_id, tipo_grafico, agrupar_fecha_por, filtros, metrica } = body as {
    nombre?: string;
    entidad?: string;
    dimension?: string;
    campo_personalizado_id?: string | null;
    tipo_grafico?: string;
    agrupar_fecha_por?: string | null;
    filtros?: { rango_dias?: number | null; etiqueta?: string | null };
    metrica?: string;
  };

  if (!nombre?.trim()) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  if (!ENTIDADES.includes(entidad as EntidadReporte)) return NextResponse.json({ error: "Entidad inválida" }, { status: 400 });
  if (!DIMENSIONES_POR_ENTIDAD[entidad as EntidadReporte].includes(dimension as DimensionReporte)) {
    return NextResponse.json({ error: "Esa dimensión no aplica a esta entidad" }, { status: 400 });
  }
  const tipoGraficoFinal = (tipo_grafico as TipoGraficoReporte) ?? "barras";
  if (!TIPOS_GRAFICO.includes(tipoGraficoFinal)) return NextResponse.json({ error: "Tipo de gráfico inválido" }, { status: 400 });
  const metricaFinal = (metrica as MetricaReporte) ?? "llamadas";
  if (!METRICAS.includes(metricaFinal)) return NextResponse.json({ error: "Métrica inválida" }, { status: 400 });

  const admin = createAdminClient();

  let esFecha = dimension === "fecha_creacion" || dimension === "fecha_modificacion";
  let campoPersonalizadoIdFinal: string | null = null;

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
    campoPersonalizadoIdFinal = campo.id;
    esFecha = campo.tipo === "date";
  }

  const agrupacionFinal = esFecha ? ((agrupar_fecha_por as AgruparFechaPor) ?? "dia") : null;
  if (esFecha && !AGRUPACIONES_FECHA.includes(agrupacionFinal as AgruparFechaPor)) {
    return NextResponse.json({ error: "Agrupación de fecha inválida" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("reportes")
    .insert({
      cuenta_id: auth.perfil.cuenta_id,
      nombre: nombre.trim(),
      entidad,
      dimension,
      campo_personalizado_id: campoPersonalizadoIdFinal,
      tipo_grafico: tipoGraficoFinal,
      agrupar_fecha_por: agrupacionFinal,
      filtros: filtros ?? {},
      metrica: metricaFinal,
      creado_por: auth.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await registrarActividad({ cuentaId: auth.perfil.cuenta_id, perfilId: auth.user.id, accion: "create_reporte", recursoTipo: "reporte", recursoId: data.id, request });

  return NextResponse.json({ reporte: data });
}
