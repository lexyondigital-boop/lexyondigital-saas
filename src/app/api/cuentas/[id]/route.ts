import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/require-super-admin";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: cuenta, error } = await admin
    .from("cuentas")
    .select("id, nombre, codigo, slug, giro, plan, activa, created_at")
    .eq("id", id)
    .single();

  if (error || !cuenta) {
    return NextResponse.json({ error: "Sub-cuenta no encontrada" }, { status: 404 });
  }

  const { data: whatsapp } = await admin
    .from("cuentas_whatsapp")
    .select("id, phone_number_id, waba_id, numero_telefono, nombre_verificado, estado")
    .eq("cuenta_id", id)
    .maybeSingle();

  const { data: perfiles } = await admin
    .from("perfiles")
    .select("id, nombre, telefono, rol, activo, created_at")
    .eq("cuenta_id", id)
    .order("created_at", { ascending: true });

  // perfiles no guarda el correo (vive en auth.users) — se resuelve aparte
  // con el cliente admin, que es el único con acceso a esa tabla.
  const usuarios = await Promise.all(
    (perfiles ?? []).map(async (p) => {
      const { data } = await admin.auth.admin.getUserById(p.id);
      return { ...p, email: data.user?.email ?? null };
    }),
  );

  return NextResponse.json({ cuenta, whatsapp: whatsapp ?? null, usuarios });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json();
  const admin = createAdminClient();

  const cambios: Record<string, unknown> = {};
  if (typeof body.nombre === "string") {
    if (!body.nombre.trim()) return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
    cambios.nombre = body.nombre.trim();
  }
  if (typeof body.giro === "string") cambios.giro = body.giro.trim() || null;
  if (typeof body.activa === "boolean") cambios.activa = body.activa;

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { data, error } = await admin.from("cuentas").update(cambios).eq("id", id).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cuenta: data });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: perfiles } = await admin.from("perfiles").select("id").eq("cuenta_id", id);

  // Borrar la cuenta hace cascade sobre perfiles/cuentas_whatsapp/etc, pero
  // no sobre auth.users -- eso hay que hacerlo aparte o quedan usuarios de
  // Auth huérfanos sin ninguna cuenta.
  for (const p of perfiles ?? []) {
    await admin.auth.admin.deleteUser(p.id);
  }

  const { error } = await admin.from("cuentas").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
