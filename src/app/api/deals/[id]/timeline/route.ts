import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";

// logs_actividad solo lo puede leer un admin de la cuenta por RLS (policy
// "logs_actividad: admin de la cuenta ve" usa es_admin_de_cuenta()) -- un
// vendedor con rol "agente" y manage_deals/view_pipeline concedidos no
// podría leer el timeline de su propio deal si se hiciera directo desde el
// cliente. Por eso esta ruta usa el admin client y gatea por el permiso
// granular del pipeline en vez de por rol.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("view_pipeline");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: deal } = await admin.from("deals").select("id").eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id).maybeSingle();
  if (!deal) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { data, error } = await admin
    .from("logs_actividad")
    .select("id, accion, detalles, created_at, perfil_id, perfiles(nombre)")
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .eq("recurso_tipo", "deal")
    .eq("recurso_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ eventos: data });
}
