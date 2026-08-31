import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

export async function POST(request: NextRequest) {
  const auth = await requirePermiso("manage_pipeline_config");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { nombre, color, orden, probabilidad_default, es_ganada, es_perdida } = await request.json();

  if (!nombre?.trim()) {
    return NextResponse.json({ error: "Falta el nombre de la etapa" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("etapas_pipeline")
    .insert({
      cuenta_id: auth.perfil.cuenta_id,
      nombre: nombre.trim(),
      color: color || "#8b5cf6",
      orden: typeof orden === "number" ? orden : 0,
      probabilidad_default: typeof probabilidad_default === "number" ? probabilidad_default : 20,
      es_ganada: !!es_ganada,
      es_perdida: !!es_perdida,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message.includes("duplicate") ? "Ya existe una etapa con ese nombre." : error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "create_etapa",
    recursoTipo: "etapa_pipeline",
    recursoId: data.id,
    detalles: { nombre: nombre.trim() },
    request,
  });

  return NextResponse.json({ ok: true, etapa: data });
}
