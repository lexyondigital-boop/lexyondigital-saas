import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";

// Agentes de voz YA CREADOS en cada sub-cuenta (no las plantillas maestras,
// que son solo el blueprint) -- para que la cuenta administradora vea de un
// vistazo qué Agent ID de Retell tiene configurado cada sub-cuenta. Datos
// puramente de nuestra base, sin llamar a Retell.
export async function GET() {
  const auth = await requirePermiso("view_agentes_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.perfil.rol !== "super_admin") {
    return NextResponse.json({ error: "Solo la cuenta administradora puede ver este reporte" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("plantillas_voz")
    .select(
      "id, nombre, agente_tipo, categoria, publicada, modo_agente, retell_agent_id, cuenta:cuentas(id, nombre, codigo, slug)",
    )
    .order("cuenta_id", { ascending: true })
    .order("nombre", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agentes: data ?? [] });
}
