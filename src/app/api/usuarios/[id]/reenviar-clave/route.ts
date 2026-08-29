import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminCuenta } from "@/lib/require-admin-cuenta";
import { registrarActividad } from "@/lib/auditoria";
import { origenPublico } from "@/lib/origen-publico";

// Mismo mecanismo que /api/cuentas/[id]/usuarios/[usuarioId]/reenviar (panel
// del super admin), pero de autoservicio: el admin de la propia cuenta lo usa
// desde Usuarios o Profesionales para reenviar el correo de "define tu
// contraseña" a alguien de su equipo.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminCuenta();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: perfil } = await admin
    .from("perfiles")
    .select("id")
    .eq("id", id)
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .maybeSingle();

  if (!perfil) {
    return NextResponse.json({ error: "Usuario no encontrado en tu cuenta" }, { status: 404 });
  }

  const { data } = await admin.auth.admin.getUserById(id);
  if (!data.user?.email) {
    return NextResponse.json({ error: "Este usuario no tiene correo" }, { status: 400 });
  }

  const clienteAnonimo = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  await clienteAnonimo.auth.resetPasswordForEmail(data.user.email, {
    redirectTo: `${origenPublico(request)}/restablecer-contrasena`,
  });

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "resend_password_email",
    recursoTipo: "user",
    recursoId: id,
    request,
  });

  return NextResponse.json({ ok: true });
}
