import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { resolverApiKeyRetell, listarVocesRetell } from "@/lib/retell";

// Catálogo de voces de Retell -- para elegir la voz del agente que se
// genera automáticamente a partir del Copyscript de una plantilla de voz.
export async function GET() {
  const auth = await requirePermiso("manage_plantillas_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const apiKey = await resolverApiKeyRetell(admin, auth.perfil.cuenta_id);
  if (!apiKey) {
    return NextResponse.json({ error: "Conecta Retell antes de elegir una voz" }, { status: 409 });
  }

  const resultado = await listarVocesRetell(apiKey);
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 502 });

  return NextResponse.json({ voces: resultado.voces });
}
