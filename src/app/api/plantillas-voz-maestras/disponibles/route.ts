import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";

// Plantillas maestras que esta cuenta puede usar como punto de partida al
// crear un agente de voz -- activas y no ocultadas por la cuenta master para
// esta cuenta (plantillas_voz_maestras_ocultas). Por defecto todas las
// activas se ven; el control es por excepción. Filtrable por categoría --
// cada categoría tiene su propio workspace en Agentes de Voz.
export async function GET(request: NextRequest) {
  const auth = await requirePermiso("manage_plantillas_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const categoria = searchParams.get("categoria");

  const admin = createAdminClient();

  const { data: ocultas } = await admin
    .from("plantillas_voz_maestras_ocultas")
    .select("plantilla_maestra_id")
    .eq("cuenta_id", auth.perfil.cuenta_id);
  const idsOcultas = (ocultas ?? []).map((o) => o.plantilla_maestra_id);

  let query = admin.from("plantillas_voz_maestras").select("*").eq("status", "activa").order("nombre", { ascending: true });
  if (categoria) query = query.eq("categoria", categoria);
  if (idsOcultas.length > 0) query = query.not("id", "in", `(${idsOcultas.join(",")})`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: cuentaRetell } = await admin
    .from("cuentas_retell")
    .select("modo")
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .eq("activo", true)
    .maybeSingle();

  const { data: asignados } = await admin
    .from("plantillas_voz_maestras_numeros_asignados")
    .select("plantilla_maestra_id, numero")
    .eq("cuenta_id", auth.perfil.cuenta_id);
  const numerosPorPlantilla = new Map((asignados ?? []).map((a) => [a.plantilla_maestra_id, a.numero]));

  return NextResponse.json({
    modoRetell: cuentaRetell?.modo ?? null,
    plantillas: (data ?? []).map((p) => ({ ...p, numero_asignado: numerosPorPlantilla.get(p.id) ?? null })),
  });
}
