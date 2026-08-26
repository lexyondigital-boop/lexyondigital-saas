import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/require-super-admin";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: cuenta_id } = await params;
  const { nombre, telefono, email, rol } = await request.json();

  if (!email?.trim()) {
    return NextResponse.json({ error: "Falta el correo" }, { status: 400 });
  }

  const rolFinal = rol === "agente" ? "agente" : "admin";
  const admin = createAdminClient();

  const { data: nuevoUsuario, error: authError } = await admin.auth.admin.createUser({
    email: email.trim(),
    email_confirm: true,
  });

  if (authError || !nuevoUsuario.user) {
    return NextResponse.json({ error: authError?.message ?? "No se pudo crear el usuario" }, { status: 500 });
  }

  const { error: perfilError } = await admin.from("perfiles").insert({
    id: nuevoUsuario.user.id,
    cuenta_id,
    nombre: nombre?.trim() || null,
    telefono: telefono?.trim() || null,
    rol: rolFinal,
    activo: true,
  });

  if (perfilError) {
    await admin.auth.admin.deleteUser(nuevoUsuario.user.id);
    return NextResponse.json({ error: perfilError.message }, { status: 500 });
  }

  const clienteAnonimo = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  await clienteAnonimo.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${request.nextUrl.origin}/restablecer-contrasena`,
  });

  return NextResponse.json({ ok: true });
}
