import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermiso } from "@/lib/require-permiso";
import { resolverColumnasCsv, filtrarColumnasCsv, generarCsvPlantilla } from "@/lib/contactos-csv";
import type { CampoPersonalizado } from "@/lib/campos-personalizados";

export async function GET(request: NextRequest) {
  const auth = await requirePermiso("view_contacts");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = await createClient();
  const { data: campos } = await supabase.from("campos_personalizados").select("*").eq("cuenta_id", auth.perfil.cuenta_id).order("orden");

  // ?columnas=telefono,nombre_completo,campo:<id> -- qué columnas eligió el
  // usuario incluir en el layout antes de descargarlo (ver
  // CargarContactosModal en CampanasView.tsx). Sin el parámetro, se
  // incluyen todas (mismo comportamiento de siempre).
  const seleccionParam = request.nextUrl.searchParams.get("columnas");
  const seleccionadas = seleccionParam ? new Set(seleccionParam.split(",").filter(Boolean)) : null;

  const columnas = filtrarColumnasCsv(resolverColumnasCsv((campos as CampoPersonalizado[]) ?? []), seleccionadas);
  const csv = generarCsvPlantilla(columnas);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla_contactos.csv"',
    },
  });
}
