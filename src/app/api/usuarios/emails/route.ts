import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminCuenta } from "@/lib/require-admin-cuenta";

// perfiles no guarda el correo (vive en auth.users) -- esto resuelve un lote
// de ids a su email, filtrando primero a los que sí son de mi propia cuenta
// para que un admin no pueda consultar correos de otra sub-cuenta.
export async function GET(request: NextRequest) {
  const auth = await requireAdminCuenta();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const idsParam = request.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({ usuarios: [] });
  }

  const admin = createAdminClient();

  const { data: perfilesDeMiCuenta } = await admin
    .from("perfiles")
    .select("id")
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .in("id", ids);

  const idsValidos = new Set((perfilesDeMiCuenta ?? []).map((p) => p.id));

  const usuarios = await Promise.all(
    [...idsValidos].map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      return { id, email: data.user?.email ?? null };
    }),
  );

  return NextResponse.json({ usuarios });
}
