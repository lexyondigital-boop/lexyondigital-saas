import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { resolverLlaveMaestraRetell, listarVocesRetell } from "@/lib/retell";

// Catálogo de voces para el formulario de plantillas maestras -- a
// diferencia de /api/integraciones/retell/voces (por sub-cuenta), aquí no
// hay ninguna cuenta_retell propia: la plantilla maestra es un blueprint sin
// agente real, así que se usa directo la API key maestra de la plataforma.
export async function GET() {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const apiKey = await resolverLlaveMaestraRetell(admin);
  if (!apiKey) {
    return NextResponse.json({ error: "Falta configurar la API key maestra de Retell en Configuración" }, { status: 409 });
  }

  const resultado = await listarVocesRetell(apiKey);
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 502 });

  return NextResponse.json({ voces: resultado.voces });
}
