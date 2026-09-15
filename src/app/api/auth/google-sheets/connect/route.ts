import { NextRequest, NextResponse } from "next/server";
import { requirePermiso } from "@/lib/require-permiso";
import { construirAuthUrlSheets, googleSheetsConfigurado } from "@/lib/google-sheets-oauth";
import { origenPublico } from "@/lib/origen-publico";

export async function POST(request: NextRequest) {
  if (!googleSheetsConfigurado()) {
    return NextResponse.json({ error: "Google todavía no está configurado en la plataforma" }, { status: 503 });
  }

  const auth = await requirePermiso("manage_integraciones");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { profesional_id, volver_a } = await request.json().catch(() => ({}));

  const redirectUri = `${origenPublico(request)}/api/auth/google-sheets/callback`;
  const url = construirAuthUrlSheets({
    redirectUri,
    estado: {
      cuentaId: auth.perfil.cuenta_id,
      profesionalId: typeof profesional_id === "string" ? profesional_id : null,
      volverA: typeof volver_a === "string" ? volver_a : "/configuracion",
      ts: Date.now(),
    },
  });

  return NextResponse.json({ url });
}
