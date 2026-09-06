import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { TIPOS_CAMPO_REPORTABLES } from "@/lib/reportes";

// Campos personalizados de la cuenta que sí sirven como dimensión de un
// reporte (select/checkbox/fecha) -- para poblar el selector "Agrupar
// por" del formulario de reportes.
export async function GET() {
  const auth = await requirePermiso("view_analytics");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("campos_personalizados")
    .select("id, nombre, tipo")
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .in("tipo", TIPOS_CAMPO_REPORTABLES as unknown as string[])
    .order("orden");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campos: data ?? [] });
}
