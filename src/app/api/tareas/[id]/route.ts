import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_deals");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { completada, titulo, descripcion, fecha_vencimiento, asignado_a } = await request.json();
  const admin = createAdminClient();

  const { data: tarea } = await admin.from("tareas").select("deal_id, titulo").eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id).maybeSingle();
  if (!tarea) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const cambios: Record<string, unknown> = {};
  if (typeof completada === "boolean") {
    cambios.completada = completada;
    cambios.completada_en = completada ? new Date().toISOString() : null;
  }
  if (typeof titulo === "string") cambios.titulo = titulo.trim();
  if (descripcion !== undefined) cambios.descripcion = descripcion?.trim() || null;
  if (fecha_vencimiento !== undefined) cambios.fecha_vencimiento = fecha_vencimiento;
  if (asignado_a !== undefined) cambios.asignado_a = asignado_a || null;

  const { error } = await admin.from("tareas").update(cambios).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (typeof completada === "boolean" && completada) {
    await registrarActividad({
      cuentaId: auth.perfil.cuenta_id,
      perfilId: auth.user.id,
      accion: "complete_task",
      recursoTipo: "deal",
      recursoId: tarea.deal_id,
      detalles: { titulo: tarea.titulo },
      request,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_deals");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: tarea } = await admin.from("tareas").select("deal_id, titulo").eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id).maybeSingle();
  if (!tarea) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const { error } = await admin.from("tareas").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "delete_task",
    recursoTipo: "deal",
    recursoId: tarea.deal_id,
    detalles: { titulo: tarea.titulo },
    request,
  });

  return NextResponse.json({ ok: true });
}
