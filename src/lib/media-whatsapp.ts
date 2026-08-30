import { createAdminClient } from "@/lib/supabase/admin";
import { descargarMediaWhatsapp } from "@/lib/meta";

const EXTENSION_POR_MIME: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/ogg; codecs=opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/amr": "amr",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function extensionDe(mimeType: string): string {
  return EXTENSION_POR_MIME[mimeType] ?? mimeType.split("/")[1]?.split(";")[0] ?? "bin";
}

// Descarga un medio de WhatsApp (la URL de Meta expira en minutos y exige el
// access_token en el header, así que no sirve para guardarla tal cual) y lo
// re-sube a Storage para tener una URL permanente que sí se pueda mostrar en
// el CRM o reenviar después.
export async function descargarYGuardarMedia({
  mediaId,
  accessToken,
  cuentaId,
}: {
  mediaId: string;
  accessToken: string;
  cuentaId: string;
}): Promise<{ ok: boolean; url: string | null; mimeType: string | null; datos: ArrayBuffer | null; error: string | null }> {
  const resultado = await descargarMediaWhatsapp({ mediaId, accessToken });

  if (!resultado.ok || !resultado.datos) {
    return { ok: false, url: null, mimeType: null, datos: null, error: resultado.error };
  }

  const mimeType = resultado.mimeType ?? "application/octet-stream";
  const ruta = `${cuentaId}/${mediaId}.${extensionDe(mimeType)}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("whatsapp-media")
    .upload(ruta, resultado.datos, { contentType: mimeType, upsert: true });

  if (error) {
    return { ok: false, url: null, mimeType: null, datos: null, error: error.message };
  }

  const { data: publica } = admin.storage.from("whatsapp-media").getPublicUrl(ruta);

  return { ok: true, url: publica.publicUrl, mimeType, datos: resultado.datos, error: null };
}
