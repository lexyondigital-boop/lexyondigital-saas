import { NextRequest, NextResponse } from "next/server";
import { requirePermiso } from "@/lib/require-permiso";
import { desconectarGoogleDrive } from "@/lib/google-sheets-oauth";

export async function POST(request: NextRequest) {
  const auth = await requirePermiso("manage_integraciones");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await request.json().catch(() => ({}));
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "Falta el id de la conexión" }, { status: 400 });
  }

  // El filtro por cuenta va dentro de desconectarGoogleDrive: sin él, un id
  // de otra sub-cuenta desconectaría su Drive.
  const borrada = await desconectarGoogleDrive({ cuentaId: auth.perfil.cuenta_id, id });
  if (!borrada) return NextResponse.json({ error: "Esa conexión no existe" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
