import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverPerfilActivo } from "@/lib/perfil-activo";

// Qué cuentas de Google tiene conectadas la sub-cuenta, para elegir destino
// al exportar. No se gatea por permiso: administrar la conexión sí exige
// manage_integraciones (ver /api/integraciones/google-drive), pero saber
// cuáles hay no es sensible para un miembro de la cuenta, y acoplarlo a
// export_contacts dejaría fuera al que solo importa.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const perfil = await resolverPerfilActivo(supabase, user.id, user.app_metadata);
  if (!perfil) return NextResponse.json({ error: "Sin cuenta asociada" }, { status: 403 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("cuentas_google_drive")
    .select("id, google_email")
    .eq("cuenta_id", perfil.cuenta_id)
    .eq("activo", true)
    .order("created_at");

  return NextResponse.json({ conexiones: data ?? [] });
}
