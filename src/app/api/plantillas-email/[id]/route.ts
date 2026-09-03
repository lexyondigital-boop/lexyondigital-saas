import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

async function verificarPropia(admin: ReturnType<typeof createAdminClient>, id: string, cuentaId: string) {
  const { data } = await admin.from("plantillas_email").select("id").eq("id", id).eq("cuenta_id", cuentaId).maybeSingle();
  return !!data;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_email");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();
  if (!(await verificarPropia(admin, id, auth.perfil.cuenta_id))) {
    return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }

  const body = await request.json();
  const cambios: Record<string, unknown> = {};
  if (typeof body.nombre === "string") cambios.nombre = body.nombre.trim();
  if (["confirmacion_cita", "reagendamiento_cita", "cancelacion_cita", "campana"].includes(body.tipo)) cambios.tipo = body.tipo;
  if (typeof body.asunto === "string") cambios.asunto = body.asunto.trim();
  if (typeof body.cuerpo_html === "string") cambios.cuerpo_html = body.cuerpo_html;
  if (typeof body.activa === "boolean") cambios.activa = body.activa;
  if ("diseno_json" in body) cambios.diseno_json = body.diseno_json ?? null;

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }
  cambios.updated_at = new Date().toISOString();

  const { data, error } = await admin.from("plantillas_email").update(cambios).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await registrarActividad({ cuentaId: auth.perfil.cuenta_id, perfilId: auth.user.id, accion: "edit_plantilla_email", recursoTipo: "plantilla_email", recursoId: id, request });

  return NextResponse.json({ plantilla: data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_email");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();
  if (!(await verificarPropia(admin, id, auth.perfil.cuenta_id))) {
    return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }

  const { error } = await admin.from("plantillas_email").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await registrarActividad({ cuentaId: auth.perfil.cuenta_id, perfilId: auth.user.id, accion: "delete_plantilla_email", recursoTipo: "plantilla_email", recursoId: id, request });

  return NextResponse.json({ ok: true });
}
