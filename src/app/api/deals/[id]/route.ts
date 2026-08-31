import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_deals");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { titulo, valor, contacto_id, fecha_cierre_estimada, probabilidad_manual } = await request.json();
  const admin = createAdminClient();

  const cambios: Record<string, unknown> = {};
  if (typeof titulo === "string") cambios.titulo = titulo.trim();
  if (typeof valor === "number") cambios.valor = valor;
  if (contacto_id !== undefined) cambios.contacto_id = contacto_id || null;
  if (fecha_cierre_estimada !== undefined) cambios.fecha_cierre_estimada = fecha_cierre_estimada || null;
  if (probabilidad_manual !== undefined) cambios.probabilidad_manual = probabilidad_manual === null ? null : Number(probabilidad_manual);

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }
  cambios.ultima_actividad_en = new Date().toISOString();

  const { error } = await admin.from("deals").update(cambios).eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "edit_deal",
    recursoTipo: "deal",
    recursoId: id,
    detalles: cambios,
    request,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_deals");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  const { error } = await admin.from("deals").delete().eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "delete_deal",
    recursoTipo: "deal",
    recursoId: id,
    request,
  });

  return NextResponse.json({ ok: true });
}
