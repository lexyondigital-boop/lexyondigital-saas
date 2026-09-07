import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { resolverApiKeyRetell, listarLlamadasRetell } from "@/lib/retell";

// Igual que /api/llamadas-voz/reporte-retell pero acotado a la propia
// cuenta -- cualquier sub-cuenta lo puede ver, no solo la administradora.
// En modo master varias sub-cuentas comparten la misma key, así que
// list-calls regresa llamadas de TODAS ellas -- se filtra por
// metadata.cuenta_id (viaja con cada llamada desde que se crea, ver
// crearLlamadaRetell) para quedarnos solo con las propias.
export async function GET() {
  const auth = await requirePermiso("view_agentes_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();

  const apiKey = await resolverApiKeyRetell(admin, auth.perfil.cuenta_id);
  if (!apiKey) return NextResponse.json({ llamadas: [] });

  const resultado = await listarLlamadasRetell(apiKey, 100);
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 502 });

  const llamadas = resultado.llamadas
    .filter((l) => l.cuentaId === auth.perfil.cuenta_id)
    .sort((a, b) => (b.startTimestamp ?? 0) - (a.startTimestamp ?? 0))
    .slice(0, 100);

  return NextResponse.json({ llamadas });
}
