import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";

// Versión de solo lectura, para el propio admin de la sub-cuenta, de lo que
// ya existe en la administración de la cuenta master (ver
// /api/cuentas/[id]/route.ts): quién tiene acceso adicional a ESTA cuenta
// desde otra (membresias_cuenta). Dar/quitar acceso sigue siendo exclusivo
// de la cuenta master -- aquí solo se lista.
export async function GET() {
  const auth = await requirePermiso("manage_users");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();

  const { data: membresiasRaw } = await admin
    .from("membresias_cuenta")
    .select("id, perfil_id, rol, activo, created_at")
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .eq("activo", true)
    .order("created_at", { ascending: true });

  const membresias = await Promise.all(
    (membresiasRaw ?? []).map(async (m) => {
      const { data } = await admin.auth.admin.getUserById(m.perfil_id);
      const { data: perfilCasa } = await admin.from("perfiles").select("nombre, cuenta_id").eq("id", m.perfil_id).maybeSingle();
      let cuentaCasa: string | null = null;
      if (perfilCasa?.cuenta_id) {
        const { data: c } = await admin.from("cuentas").select("nombre").eq("id", perfilCasa.cuenta_id).maybeSingle();
        cuentaCasa = c?.nombre ?? null;
      }
      return { ...m, email: data.user?.email ?? null, nombre: perfilCasa?.nombre ?? null, cuenta_casa: cuentaCasa };
    }),
  );

  return NextResponse.json({ membresias });
}
