import { NextRequest, NextResponse } from "next/server";
import { requirePermiso } from "@/lib/require-permiso";
import { desconectarGoogleDrive } from "@/lib/google-sheets-oauth";
import { registrarActividad } from "@/lib/auditoria";

export async function POST(request: NextRequest) {
  const auth = await requirePermiso("manage_integraciones");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await request.json().catch(() => ({}));
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "Falta el id de la conexión" }, { status: 400 });
  }

  // El filtro por cuenta va dentro de desconectarGoogleDrive: sin él, un id
  // de otra sub-cuenta desconectaría su Drive.
  const correo = await desconectarGoogleDrive({ cuentaId: auth.perfil.cuenta_id, id });
  if (!correo) return NextResponse.json({ error: "Esa conexión no existe" }, { status: 404 });

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "disconnect_google_drive",
    detalles: { correo },
    request,
  });

  return NextResponse.json({ ok: true });
}
