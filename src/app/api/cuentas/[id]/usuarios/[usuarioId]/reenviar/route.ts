import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { origenPublico } from "@/lib/origen-publico";

export async function POST(
  request: NextRequest,
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

  const { data } = await admin.auth.admin.getUserById(usuarioId);
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

  return NextResponse.json({ ok: true });
}
