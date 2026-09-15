import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";
import { obtenerAccessTokenDriveVigente } from "@/lib/google-sheets-oauth";
import { crearHojaConDatos, nombreDeHoja } from "@/lib/google-sheets";

const MAX_FILAS = 5000;

// Exporta a una hoja nueva en el Drive de la conexión elegida. Las filas
// llegan armadas desde el cliente, igual que en la descarga de CSV: así la
// hoja sale con las mismas columnas visibles y en el mismo orden que el
// usuario tiene en pantalla.
export async function POST(request: NextRequest) {
  const auth = await requirePermiso("export_sheets");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { conexion_id, encabezados, filas } = await request.json().catch(() => ({}));

  if (typeof conexion_id !== "string" || !conexion_id) {
    return NextResponse.json({ error: "Elige a qué cuenta de Google exportar" }, { status: 400 });
  }
  if (!Array.isArray(encabezados) || encabezados.length === 0) {
    return NextResponse.json({ error: "No hay columnas que exportar" }, { status: 400 });
  }
  if (!Array.isArray(filas) || filas.length === 0) {
    return NextResponse.json({ error: "No hay contactos que exportar" }, { status: 400 });
  }
  if (filas.length > MAX_FILAS) {
    return NextResponse.json(
      { error: `Son ${filas.length} contactos y el máximo por hoja es ${MAX_FILAS}. Filtra la lista antes de exportar.` },
      { status: 400 },
    );
  }

  const cuentaId = auth.perfil.cuenta_id;
  const admin = createAdminClient();

  const [{ data: conexion }, { data: cuenta }] = await Promise.all([
    admin
      .from("cuentas_google_drive")
      .select("id, google_email, refresh_token_cifrado")
      .eq("id", conexion_id)
      .eq("cuenta_id", cuentaId)
      .eq("activo", true)
      .maybeSingle(),
    admin.from("cuentas").select("nombre, slug").eq("id", cuentaId).single(),
  ]);

  if (!conexion) {
    return NextResponse.json({ error: "Esa cuenta de Google ya no está conectada" }, { status: 404 });
  }

  const nombre = nombreDeHoja(cuenta?.slug ?? null, cuenta?.nombre ?? "cuenta");

  let hoja: { spreadsheetId: string; url: string };
  try {
    const accessToken = await obtenerAccessTokenDriveVigente(conexion.refresh_token_cifrado);
    hoja = await crearHojaConDatos({
      accessToken,
      nombre,
      encabezados: encabezados.map(String),
      filas: filas.map((f: unknown[]) => f.map((v) => (v == null ? "" : String(v)))),
    });
  } catch (e) {
    // El motivo real importa: un token revocado desde myaccount.google.com y
    // una API caída se arreglan distinto, y el usuario no puede adivinar cuál
    // le tocó.
    const mensaje = e instanceof Error ? e.message : "No se pudo crear la hoja en Google";
    return NextResponse.json({ error: mensaje }, { status: 502 });
  }

  await admin.from("hojas_generadas").insert({
    cuenta_id: cuentaId,
    conexion_id: conexion.id,
    spreadsheet_id: hoja.spreadsheetId,
    url: hoja.url,
    nombre,
    columnas: encabezados.map(String),
    total_filas: filas.length,
    creado_por: auth.user.id,
  });

  await registrarActividad({
    cuentaId,
    perfilId: auth.user.id,
    accion: "export_contacts_sheets",
    detalles: { archivo: nombre, destino: conexion.google_email, filas: filas.length },
    request,
  });

  return NextResponse.json({ ok: true, url: hoja.url, nombre, correo: conexion.google_email });
}
