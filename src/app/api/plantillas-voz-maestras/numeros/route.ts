import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { resolverLlaveMaestraRetell, listarNumerosRetell } from "@/lib/retell";

// Números ya comprados en la cuenta maestra de Retell -- para elegir cuáles
// quedan disponibles en cada plantilla maestra (luego se asignan por
// sub-cuenta desde su administración).
export async function GET() {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const apiKey = await resolverLlaveMaestraRetell(admin);
  if (!apiKey) {
    return NextResponse.json({ error: "Falta configurar la API key maestra de Retell en Configuración" }, { status: 409 });
  }

  const resultado = await listarNumerosRetell(apiKey);
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 502 });

  return NextResponse.json({ numeros: resultado.numeros });
}
