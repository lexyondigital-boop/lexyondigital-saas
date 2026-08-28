import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registrarActividad } from "@/lib/auditoria";

// Debe llamarse ANTES de signOut() -- una vez cerrada la sesión ya no hay
// forma de saber a quién pertenece la acción.
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
    await registrarActividad({ cuentaId: perfil.cuenta_id, perfilId: user.id, accion: "logout", request });
  }

  return NextResponse.json({ ok: true });
}
