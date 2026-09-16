import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerAccessTokenDriveVigente } from "@/lib/google-sheets-oauth";

// Resuelve una conexión de Drive de la cuenta y devuelve un access token
// vigente. El filtro por cuenta_id no es decorativo: sin él, un id de otra
// sub-cuenta daría acceso a su Drive.
export async function accessTokenDeConexion(
  cuentaId: string,
  conexionId: string,
): Promise<{ ok: false; error: string; status: number } | { ok: true; accessToken: string; correo: string }> {
  const admin = createAdminClient();
  const { data: conexion } = await admin
    .from("cuentas_google_drive")
    .select("google_email, refresh_token_cifrado")
    .eq("id", conexionId)
    .eq("cuenta_id", cuentaId)
    .eq("activo", true)
    .maybeSingle();

  if (!conexion) return { ok: false, error: "Esa cuenta de Google ya no está conectada", status: 404 };

  try {
    const accessToken = await obtenerAccessTokenDriveVigente(conexion.refresh_token_cifrado);
    return { ok: true, accessToken, correo: conexion.google_email };
  } catch (e) {
    // Suele ser un token revocado a mano desde myaccount.google.com. Decirlo
    // ahorra que el usuario revise todo lo demás antes de dar con el motivo.
    const mensaje = e instanceof Error ? e.message : "No se pudo renovar el acceso a Google";
    return { ok: false, error: `${mensaje}. Vuelve a conectar la cuenta desde Configuración.`, status: 502 };
  }
}
