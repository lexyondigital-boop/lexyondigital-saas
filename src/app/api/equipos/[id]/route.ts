import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminCuenta } from "@/lib/require-admin-cuenta";
import { registrarActividad } from "@/lib/auditoria";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminCuenta();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { nombre, descripcion, color } = await request.json();
  const admin = createAdminClient();

  const cambios: Record<string, unknown> = {};
  if (typeof nombre === "string") cambios.nombre = nombre.trim();
  if (typeof descripcion === "string") cambios.descripcion = descripcion.trim() || null;
  if (typeof color === "string") cambios.color = color;

  const { error } = await admin.from("equipos").update(cambios).eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "edit_team",
    recursoTipo: "team",
    recursoId: id,
    detalles: cambios,
    request,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminCuenta();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  await admin.from("perfiles").update({ equipo_id: null }).eq("equipo_id", id);

  const { error } = await admin.from("equipos").delete().eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "delete_team",
    recursoTipo: "team",
    recursoId: id,
    request,
  });

  return NextResponse.json({ ok: true });
}
