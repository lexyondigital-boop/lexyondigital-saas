import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminCuenta } from "@/lib/require-admin-cuenta";
import { registrarActividad } from "@/lib/auditoria";

// Editar/quitar una membresía -- siempre acotado a auth.perfil.cuenta_id
// (la cuenta activa de quien llama), nunca a una cuenta_id recibida del
// cliente, para que un admin de sub-cuenta solo pueda tocar membresías de
// SU cuenta.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ membresiaId: string }> }) {
  const auth = await requireAdminCuenta();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { membresiaId } = await params;
  const { rol } = await request.json();
  if (rol !== "admin" && rol !== "agente") return NextResponse.json({ error: "Rol inválido" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("membresias_cuenta")
    .update({ rol })
    .eq("id", membresiaId)
    .eq("cuenta_id", auth.perfil.cuenta_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ membresiaId: string }> }) {
  const auth = await requireAdminCuenta();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { membresiaId } = await params;
  const admin = createAdminClient();

  const { data: membresia } = await admin.from("membresias_cuenta").select("perfil_id").eq("id", membresiaId).eq("cuenta_id", auth.perfil.cuenta_id).maybeSingle();

  const { error } = await admin.from("membresias_cuenta").delete().eq("id", membresiaId).eq("cuenta_id", auth.perfil.cuenta_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (membresia) {
    await registrarActividad({
      cuentaId: auth.perfil.cuenta_id,
      perfilId: auth.user.id,
      accion: "revoke_membresia",
      recursoTipo: "user",
      recursoId: membresia.perfil_id,
      request,
    });
  }

  return NextResponse.json({ ok: true });
}
