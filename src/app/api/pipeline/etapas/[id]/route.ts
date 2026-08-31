import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_pipeline_config");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { nombre, color, orden, probabilidad_default, es_ganada, es_perdida } = await request.json();
  const admin = createAdminClient();

  const cambios: Record<string, unknown> = {};
  if (typeof nombre === "string") cambios.nombre = nombre.trim();
  if (typeof color === "string") cambios.color = color;
  if (typeof orden === "number") cambios.orden = orden;
  if (typeof probabilidad_default === "number") cambios.probabilidad_default = probabilidad_default;
  if (typeof es_ganada === "boolean") cambios.es_ganada = es_ganada;
  if (typeof es_perdida === "boolean") cambios.es_perdida = es_perdida;

  const { error } = await admin.from("etapas_pipeline").update(cambios).eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "edit_etapa",
    recursoTipo: "etapa_pipeline",
    recursoId: id,
    detalles: cambios,
    request,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_pipeline_config");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  // Ya no se bloquea si tiene deals -- se permite borrar igual, y los deals
  // que estaban ahí quedan sin etapa (deals.etapa_id -> null vía "on delete
  // set null"). El admin ya vio la advertencia con el conteo antes de
  // confirmar (ver PipelineView.tsx), así que aquí solo se registra cuántos
  // quedaron afectados para el timeline.
  const { count: dealsAfectados } = await admin.from("deals").select("id", { count: "exact", head: true }).eq("etapa_id", id);

  const { error } = await admin.from("etapas_pipeline").delete().eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "delete_etapa",
    recursoTipo: "etapa_pipeline",
    recursoId: id,
    detalles: { deals_afectados: dealsAfectados ?? 0 },
    request,
  });

  return NextResponse.json({ ok: true });
}
