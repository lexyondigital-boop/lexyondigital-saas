import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Se llama justo después de iniciar sesión (ver src/app/login/page.tsx) --
// si el correo tiene acceso a más de una cuenta (la de casa + membresías
// adicionales, ver migración 20260923000000), se le pregunta a cuál
// entrar; si solo tiene una, el login sigue derecho como siempre.
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: perfilCasa } = await admin.from("perfiles").select("cuenta_id, rol, activo").eq("id", user.id).maybeSingle();

  if (!perfilCasa || !perfilCasa.activo) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const { data: membresias } = await admin
    .from("membresias_cuenta")
    .select("cuenta_id, rol")
    .eq("perfil_id", user.id)
    .eq("activo", true);

  const cuentaIds = [perfilCasa.cuenta_id, ...(membresias ?? []).map((m) => m.cuenta_id)];
  const { data: cuentas } = await admin.from("cuentas").select("id, nombre, codigo").in("id", cuentaIds);
  const nombrePorId = new Map((cuentas ?? []).map((c) => [c.id, c]));

  const disponibles = [
    { cuenta_id: perfilCasa.cuenta_id, rol: perfilCasa.rol, es_casa: true },
    ...(membresias ?? []).map((m) => ({ cuenta_id: m.cuenta_id, rol: m.rol, es_casa: false })),
  ].map((d) => ({
    ...d,
    nombre: nombrePorId.get(d.cuenta_id)?.nombre ?? "Cuenta",
    codigo: nombrePorId.get(d.cuenta_id)?.codigo ?? null,
  }));

  return NextResponse.json({ cuentas: disponibles });
}
