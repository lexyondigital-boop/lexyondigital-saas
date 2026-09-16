import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";
import { accessTokenDeConexion } from "@/lib/conexion-drive";
import { leerFilasDeHoja } from "@/lib/google-sheets";
import { importarContactosDesdeFilas } from "@/lib/importar-contactos";
import type { PaisImportacion } from "@/lib/telefono-import";

const MAX_FILAS = 5000;

// Lee una hoja de Google e importa sus contactos. La lectura pasa por el
// servidor y no por el navegador: así el token no tiene que viajar con los
// datos y se reutiliza tal cual la tubería de importación que ya usa la
// carga por CSV de campañas, con sus mismas reglas.
export async function POST(request: NextRequest) {
  const auth = await requirePermiso("import_sheets");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { conexion_id, spreadsheet_id, actualizar_existentes, asignado_a } = await request.json().catch(() => ({}));

  if (typeof conexion_id !== "string" || !conexion_id) {
    return NextResponse.json({ error: "Falta la cuenta de Google" }, { status: 400 });
  }
  if (typeof spreadsheet_id !== "string" || !spreadsheet_id) {
    return NextResponse.json({ error: "Elige la hoja que quieres importar" }, { status: 400 });
  }

  const cuentaId = auth.perfil.cuenta_id;
  const admin = createAdminClient();

  const conexion = await accessTokenDeConexion(cuentaId, conexion_id);
  if (!conexion.ok) return NextResponse.json({ error: conexion.error }, { status: conexion.status });

  let filasCrudas: string[][];
  try {
    filasCrudas = await leerFilasDeHoja({ accessToken: conexion.accessToken, spreadsheetId: spreadsheet_id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer la hoja" }, { status: 502 });
  }

  // El caso típico es haber creado la plantilla y darle importar sin
  // llenarla todavía; la tubería compartida diría "archivo", que aquí no
  // significa nada.
  if (filasCrudas.length < 2) {
    return NextResponse.json(
      { error: "La hoja no tiene filas de datos. Llénala en Google y vuelve a intentarlo." },
      { status: 400 },
    );
  }

  if (filasCrudas.length > MAX_FILAS + 1) {
    return NextResponse.json(
      { error: `La hoja tiene ${filasCrudas.length - 1} filas y el máximo por importación es ${MAX_FILAS}.` },
      { status: 400 },
    );
  }

  const resultado = await importarContactosDesdeFilas({
    admin,
    cuentaId,
    filasCrudas,
    pais: "MX" as PaisImportacion,
    asignadoA: typeof asignado_a === "string" && asignado_a ? asignado_a : null,
    actualizarExistentes: actualizar_existentes === true,
    canalOrigen: "importación",
  });

  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: resultado.status });

  await registrarActividad({
    cuentaId,
    perfilId: auth.user.id,
    accion: "import_contacts_sheets",
    detalles: {
      origen: conexion.correo,
      importados: resultado.importados,
      actualizados: resultado.actualizados,
      omitidos: resultado.omitidos.length,
    },
    request,
  });

  return NextResponse.json({
    ok: true,
    importados: resultado.importados,
    actualizados: resultado.actualizados,
    omitidos: resultado.omitidos,
    columnas_ignoradas: resultado.columnasIgnoradas,
  });
}
