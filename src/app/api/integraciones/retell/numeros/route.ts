import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { resolverApiKeyRetell, listarNumerosRetell } from "@/lib/retell";

// Números ya comprados/importados en la cuenta de Retell conectada (master
// o propia, según lo que haya elegido la cuenta) -- para que el número
// saliente se elija de una lista real en vez de copiarlo/pegarlo a mano.
export async function GET() {
  const auth = await requirePermiso("manage_integraciones");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const apiKey = await resolverApiKeyRetell(admin, auth.perfil.cuenta_id);
  if (!apiKey) {
    return NextResponse.json({ error: "Conecta Retell antes de elegir un número saliente" }, { status: 409 });
  }

  const resultado = await listarNumerosRetell(apiKey);
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 502 });

  return NextResponse.json({ numeros: resultado.numeros });
}
