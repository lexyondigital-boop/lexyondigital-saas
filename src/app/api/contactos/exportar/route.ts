import { NextRequest, NextResponse } from "next/server";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

// Solo deja rastro en auditoría -- el CSV en sí se arma del lado del
// cliente (los contactos ya están cargados ahí). Exportar datos de
// contactos es una acción sensible, vale la pena que quede registrada.
export async function POST(request: NextRequest) {
  const auth = await requirePermiso("export_contacts");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "export_contacts",
    request,
  });

  return NextResponse.json({ ok: true });
}
