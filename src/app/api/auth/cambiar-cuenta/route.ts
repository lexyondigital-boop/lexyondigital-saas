import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Cambia la cuenta activa del usuario -- guarda cuenta_activa en su
// app_metadata (solo editable con la service role, nunca por el propio
// usuario) para que el próximo refresh de sesión traiga esa cuenta en el
// JWT y cuenta_id_actual() la respete (ver migración
// 20260923000000_membresias_multi_cuenta.sql). El cliente debe llamar
// supabase.auth.refreshSession() después de un 200 para que el cambio
// surta efecto de inmediato.
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { cuenta_id } = await request.json();
  if (!cuenta_id) {
    return NextResponse.json({ error: "Falta cuenta_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: perfilCasa } = await admin.from("perfiles").select("cuenta_id").eq("id", user.id).maybeSingle();
  if (!perfilCasa) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  let permitido = cuenta_id === perfilCasa.cuenta_id;
  if (!permitido) {
    const { data: membresia } = await admin
      .from("membresias_cuenta")
      .select("id")
      .eq("perfil_id", user.id)
      .eq("cuenta_id", cuenta_id)
      .eq("activo", true)
      .maybeSingle();
    permitido = !!membresia;
  }

  if (!permitido) {
    return NextResponse.json({ error: "No tienes acceso a esa cuenta" }, { status: 403 });
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...user.app_metadata,
      cuenta_activa: cuenta_id === perfilCasa.cuenta_id ? null : cuenta_id,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
