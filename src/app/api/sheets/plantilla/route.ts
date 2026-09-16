import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { accessTokenDeConexion } from "@/lib/conexion-drive";
import { crearHojaPlantilla, nombreDeHoja } from "@/lib/google-sheets";
import { resolverColumnasCsv, filtrarColumnasCsv } from "@/lib/contactos-csv";
import type { CampoPersonalizado } from "@/lib/campos-personalizados";

// Crea una hoja vacía con las columnas elegidas para que el usuario la llene
// en Google y luego la importe. Equivale a "Descargar plantilla CSV" del
// flujo de campañas, y usa la misma resolución de columnas: así el layout
// que el usuario llena es exactamente el que la importación sabe leer.
export async function POST(request: NextRequest) {
  const auth = await requirePermiso("import_sheets");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { conexion_id, columnas } = await request.json().catch(() => ({}));
  if (typeof conexion_id !== "string" || !conexion_id) {
    return NextResponse.json({ error: "Elige en qué cuenta de Google crear la hoja" }, { status: 400 });
  }

  const cuentaId = auth.perfil.cuenta_id;
  const admin = createAdminClient();

  const [conexion, { data: campos }, { data: cuenta }] = await Promise.all([
    accessTokenDeConexion(cuentaId, conexion_id),
    admin.from("campos_personalizados").select("*").eq("cuenta_id", cuentaId).order("orden"),
    admin.from("cuentas").select("nombre, slug").eq("id", cuentaId).single(),
  ]);

  if (!conexion.ok) return NextResponse.json({ error: conexion.error }, { status: conexion.status });

  const seleccionadas = Array.isArray(columnas) && columnas.length > 0 ? new Set(columnas.map(String)) : null;
  const elegidas = filtrarColumnasCsv(resolverColumnasCsv((campos as CampoPersonalizado[]) ?? []), seleccionadas);
  const encabezados = elegidas.map((c) => c.header);

  const nombre = nombreDeHoja(cuenta?.slug ?? null, cuenta?.nombre ?? "cuenta");

  let hoja: { spreadsheetId: string; url: string };
  try {
    hoja = await crearHojaPlantilla({ accessToken: conexion.accessToken, nombre, encabezados });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo crear la hoja" }, { status: 502 });
  }

  await admin.from("hojas_generadas").insert({
    cuenta_id: cuentaId,
    conexion_id,
    spreadsheet_id: hoja.spreadsheetId,
    url: hoja.url,
    nombre,
    columnas: encabezados,
    total_filas: 0,
    creado_por: auth.user.id,
  });

  // Se devuelve el spreadsheetId para que el navegador pueda importar esta
  // misma hoja sin pasar por el selector: la acaba de crear la plataforma,
  // así que ya sabe cuál es.
  return NextResponse.json({
    ok: true,
    spreadsheet_id: hoja.spreadsheetId,
    url: hoja.url,
    nombre,
    correo: conexion.correo,
  });
}
