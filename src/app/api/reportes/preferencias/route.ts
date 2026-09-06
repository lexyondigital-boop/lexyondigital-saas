import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";

// Cuáles reportes tiene ESTE usuario en su propio dashboard y en qué
// orden -- no requiere manage_reportes porque solo afecta su vista.
export async function GET() {
  const auth = await requirePermiso("view_analytics");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reportes_preferencias_usuario")
    .select("reporte_id, orden")
    .eq("perfil_id", auth.user.id)
    .order("orden", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ preferencias: data ?? [] });
}

// Reemplaza el arreglo completo -- se usa tanto al agregar/quitar un
// reporte como al reordenar por drag & drop.
export async function PUT(request: NextRequest) {
  const auth = await requirePermiso("view_analytics");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { preferencias } = (await request.json()) as { preferencias?: { reporte_id: string; orden: number }[] };
  if (!Array.isArray(preferencias)) {
    return NextResponse.json({ error: "Falta el arreglo de preferencias" }, { status: 400 });
  }

  const admin = createAdminClient();
  await admin.from("reportes_preferencias_usuario").delete().eq("perfil_id", auth.user.id);

  if (preferencias.length > 0) {
    const { error } = await admin.from("reportes_preferencias_usuario").insert(
      preferencias.map((p, i) => ({ perfil_id: auth.user.id, reporte_id: p.reporte_id, orden: p.orden ?? i })),
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
