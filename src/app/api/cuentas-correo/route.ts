import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";

// La tabla cuentas_correo guarda secretos cifrados (refresh token de
// Gmail, contraseña SMTP) -- el estado que ve el frontend se sirve por
// esta ruta server-side con el cliente admin, seleccionando solo columnas
// no secretas, en vez de exponer la tabla por lectura directa RLS.
export async function GET() {
  const auth = await requirePermiso("manage_email");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data } = await admin
    .from("cuentas_correo")
    .select("proveedor, remitente_nombre, remitente_correo, google_oauth_email, google_oauth_connected_at, smtp_host, smtp_port, smtp_usuario, updated_at")
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .eq("activo", true)
    .maybeSingle();

  return NextResponse.json({ conectado: data ?? null });
}
