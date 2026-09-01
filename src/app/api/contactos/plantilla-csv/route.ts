import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/require-permiso";
import { resolverColumnasCsv, generarCsvPlantilla } from "@/lib/contactos-csv";
import type { CampoPersonalizado } from "@/lib/campos-personalizados";

export async function GET() {
  const auth = await requirePermiso("view_contacts");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = await createClient();
  const { data: campos } = await supabase.from("campos_personalizados").select("*").eq("cuenta_id", auth.perfil.cuenta_id).order("orden");

  const columnas = resolverColumnasCsv((campos as CampoPersonalizado[]) ?? []);
  const csv = generarCsvPlantilla(columnas);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla_contactos.csv"',
    },
  });
}
