import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registrarActividad } from "@/lib/auditoria";

// Llamado por la pantalla de login justo después de un signInWithPassword
// exitoso (la sesión ya quedó en cookies para este request).
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false });
  }

  const { data: perfil } = await supabase.from("perfiles").select("cuenta_id").eq("id", user.id).maybeSingle();

  if (perfil) {
    await registrarActividad({ cuentaId: perfil.cuenta_id, perfilId: user.id, accion: "login", request });
  }

  return NextResponse.json({ ok: true });
}
