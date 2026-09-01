import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { obtenerCredencialesWhatsapp, obtenerCredencialesWhatsappPorId } from "@/lib/whatsapp-credenciales";
import { subirMedioParaHandle } from "@/lib/meta-plantillas";

// Límites de Meta para medios de muestra al someter una plantilla (mismo
// límite que aplica al mandar ese tipo de medio por mensaje normal).
const LIMITES_POR_TIPO: Record<string, number> = {
  "image/jpeg": 5 * 1024 * 1024,
  "image/png": 5 * 1024 * 1024,
  "video/mp4": 16 * 1024 * 1024,
  "application/pdf": 100 * 1024 * 1024,
};

const EXTENSION_POR_TIPO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

// Sube el medio de muestra (encabezado o tarjeta de carrusel) a Storage --
// eso siempre queda disponible como vista previa aunque falle lo siguiente --
// y además intenta obtener el "handle" que exige Meta para poder someter la
// plantilla de verdad. Si falta META_APP_ID o la subida a Meta falla, se
// devuelve igual la url local con handle: null: la plantilla se guarda como
// borrador (ver src/app/api/plantillas/route.ts) en vez de perderse.
export async function POST(request: NextRequest) {
  const auth = await requirePermiso("create_templates");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const formData = await request.formData();
  const archivo = formData.get("archivo");
  const cuentaWhatsappId = (formData.get("cuenta_whatsapp_id") as string | null)?.trim() || null;

  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }

  const limite = LIMITES_POR_TIPO[archivo.type];
  const extension = EXTENSION_POR_TIPO[archivo.type];
  if (!limite || !extension) {
    return NextResponse.json({ error: "Tipo de archivo no admitido (usa JPG, PNG, MP4 o PDF)" }, { status: 400 });
  }
  if (archivo.size > limite) {
    return NextResponse.json({ error: `El archivo supera el límite de ${limite / 1024 / 1024} MB para este tipo` }, { status: 400 });
  }

  const admin = createAdminClient();
  const cuentaId = auth.perfil.cuenta_id;
  const ruta = `${cuentaId}/${randomUUID()}.${extension}`;
  const bytes = await archivo.arrayBuffer();

  const { error: errorSubida } = await admin.storage.from("plantillas-media").upload(ruta, bytes, { contentType: archivo.type });
  if (errorSubida) {
    return NextResponse.json({ error: `No se pudo subir el archivo: ${errorSubida.message}` }, { status: 500 });
  }

  const { data: publica } = admin.storage.from("plantillas-media").getPublicUrl(ruta);

  const credenciales = cuentaWhatsappId
    ? await obtenerCredencialesWhatsappPorId(admin, cuentaWhatsappId, cuentaId)
    : await obtenerCredencialesWhatsapp(admin, cuentaId);

  if (!credenciales) {
    return NextResponse.json({ url: publica.publicUrl, handle: null, error: "No hay un número de WhatsApp con credenciales para subir el medio a Meta" });
  }

  const resultado = await subirMedioParaHandle({ accessToken: credenciales.accessToken, bytes, mimeType: archivo.type });

  return NextResponse.json({ url: publica.publicUrl, handle: resultado.handle, error: resultado.error });
}
