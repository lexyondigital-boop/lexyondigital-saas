import { NextRequest, NextResponse } from "next/server";
import { requirePermiso } from "@/lib/require-permiso";
import { construirAuthUrlEmail, googleEmailConfigurado } from "@/lib/google-email-oauth";
import { origenPublico } from "@/lib/origen-publico";

export async function POST(request: NextRequest) {
  if (!googleEmailConfigurado()) {
    return NextResponse.json({ error: "Google todavía no está configurado en la plataforma" }, { status: 503 });
  }

  const auth = await requirePermiso("manage_email");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { volver_a } = await request.json().catch(() => ({}));

  const redirectUri = `${origenPublico(request)}/api/auth/google-email/callback`;
  const url = construirAuthUrlEmail({
    redirectUri,
    estado: {
      cuentaId: auth.perfil.cuenta_id,
      volverA: typeof volver_a === "string" ? volver_a : "/configuracion",
      ts: Date.now(),
    },
  });

  return NextResponse.json({ url });
}
