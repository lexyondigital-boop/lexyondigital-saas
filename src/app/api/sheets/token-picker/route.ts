import { NextRequest, NextResponse } from "next/server";
import { requirePermiso } from "@/lib/require-permiso";
import { accessTokenDeConexion } from "@/lib/conexion-drive";

// Entrega al navegador un access token de la conexión para que el Google
// Picker muestre el Drive de esa cuenta. Es el patrón que Google documenta
// para el Picker (setOAuthToken), y no hay alternativa: el selector corre en
// el navegador y necesita hablar con Drive desde ahí.
//
// Lo que se entrega es un access token, que vive una hora y solo alcanza los
// archivos que la app creó o que el usuario le entregue por el propio Picker
// (scope drive.file). El refresh token, que es el que de verdad importa,
// nunca sale del servidor.
//
// Se pide el mismo permiso que importar: quien puede traer contactos desde
// una hoja ya puede, por definición, leer esas hojas.
export async function POST(request: NextRequest) {
  const auth = await requirePermiso("import_sheets");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { conexion_id } = await request.json().catch(() => ({}));
  if (typeof conexion_id !== "string" || !conexion_id) {
    return NextResponse.json({ error: "Falta la cuenta de Google" }, { status: 400 });
  }

  const conexion = await accessTokenDeConexion(auth.perfil.cuenta_id, conexion_id);
  if (!conexion.ok) return NextResponse.json({ error: conexion.error }, { status: conexion.status });

  return NextResponse.json({ access_token: conexion.accessToken, correo: conexion.correo });
}
