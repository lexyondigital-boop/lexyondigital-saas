import { NextRequest, NextResponse } from "next/server";
import { requirePermiso } from "@/lib/require-permiso";
import { desconectarGoogleEmail } from "@/lib/google-email-oauth";
import { registrarActividad } from "@/lib/auditoria";

export async function POST(request: NextRequest) {
  const auth = await requirePermiso("manage_email");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await desconectarGoogleEmail(auth.perfil.cuenta_id);

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "disconnect_email",
    recursoTipo: "cuenta_correo",
    request,
  });

  return NextResponse.json({ ok: true });
}
