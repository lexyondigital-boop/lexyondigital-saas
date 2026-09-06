import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { resolverApiKeyRetell, listarAgentesRetell } from "@/lib/retell";

// Agentes ya creados en la cuenta de Retell conectada -- para el modo
// "agente propio" de una plantilla de voz (la cuenta ya configuró el agente
// directamente en Retell y solo quiere elegirlo de una lista).
export async function GET() {
  const auth = await requirePermiso("manage_plantillas_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const apiKey = await resolverApiKeyRetell(admin, auth.perfil.cuenta_id);
  if (!apiKey) {
    return NextResponse.json({ error: "Conecta Retell antes de elegir un agente" }, { status: 409 });
  }

  const resultado = await listarAgentesRetell(apiKey);
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 502 });

  return NextResponse.json({ agentes: resultado.agentes });
}
