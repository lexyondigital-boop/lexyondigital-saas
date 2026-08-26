import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/require-super-admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; usuarioId: string }> },
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: cuenta_id, usuarioId } = await params;
  const body = await request.json();
  const admin = createAdminClient();

  const cambios: Record<string, unknown> = {};
  if (body.rol === "admin" || body.rol === "agente") cambios.rol = body.rol;
  if (typeof body.activo === "boolean") cambios.activo = body.activo;

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { error } = await admin
    .from("perfiles")
    .update(cambios)
    .eq("id", usuarioId)
    .eq("cuenta_id", cuenta_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; usuarioId: string }> },
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: cuenta_id, usuarioId } = await params;
  const admin = createAdminClient();

  const { data: perfil } = await admin
    .from("perfiles")
    .select("id")
    .eq("id", usuarioId)
    .eq("cuenta_id", cuenta_id)
    .maybeSingle();

  if (!perfil) {
    return NextResponse.json({ error: "Usuario no encontrado en esta cuenta" }, { status: 404 });
  }

  await admin.auth.admin.deleteUser(usuarioId);

  return NextResponse.json({ ok: true });
}
