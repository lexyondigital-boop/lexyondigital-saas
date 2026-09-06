import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";

// Plantillas maestras que esta cuenta puede usar como punto de partida al
// crear un agente de voz -- activas y no ocultadas por la cuenta master para
// esta cuenta (plantillas_voz_maestras_ocultas). Por defecto todas las
// activas se ven; el control es por excepción.
export async function GET() {
  const auth = await requirePermiso("manage_plantillas_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();

  const { data: ocultas } = await admin
    .from("plantillas_voz_maestras_ocultas")
    .select("plantilla_maestra_id")
    .eq("cuenta_id", auth.perfil.cuenta_id);
  const idsOcultas = (ocultas ?? []).map((o) => o.plantilla_maestra_id);

  let query = admin.from("plantillas_voz_maestras").select("*").eq("status", "activa").order("nombre", { ascending: true });
  if (idsOcultas.length > 0) query = query.not("id", "in", `(${idsOcultas.join(",")})`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ plantillas: data ?? [] });
}
