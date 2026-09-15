import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { googleSheetsConfigurado } from "@/lib/google-sheets-oauth";

// Estado de la integración para la pantalla de Configuración. Se sirve con el
// cliente admin y se eligen las columnas a mano para que el refresh token
// nunca salga de aquí.
export async function GET() {
  const auth = await requirePermiso("manage_integraciones");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const cuentaId = auth.perfil.cuenta_id;

  const [{ data: profesionales }, { data: conexiones }] = await Promise.all([
    admin
      .from("profesionales")
      .select("id, nombre, email, google_oauth_email")
      .eq("cuenta_id", cuentaId)
      .order("nombre"),
    admin
      .from("cuentas_google_drive")
      .select("id, google_email, profesional_id, created_at")
      .eq("cuenta_id", cuentaId)
      .eq("activo", true)
      .order("created_at"),
  ]);

  return NextResponse.json({
    configurado: googleSheetsConfigurado(),
    profesionales: profesionales ?? [],
    conexiones: conexiones ?? [],
  });
}
