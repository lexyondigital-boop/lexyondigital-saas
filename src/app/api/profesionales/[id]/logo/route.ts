import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const LIMITE_BYTES = 2 * 1024 * 1024;
const EXTENSION_POR_TIPO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };

// Sube el logo de un profesional como imagen -- lo puede hacer un admin
// (para cualquier profesional de su cuenta) o el propio profesional para
// sí mismo, mismo patrón esAdmin || esElMismo que ya usan las rutas de
// conectar/desconectar Google Calendar.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase.from("perfiles").select("rol, cuenta_id, profesional_id").eq("id", user.id).single();
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });

  const { id: profesionalId } = await params;
  const esAdmin = perfil.rol === "admin" || perfil.rol === "super_admin";
  const esElMismo = perfil.profesional_id === profesionalId;
  if (!esAdmin && !esElMismo) {
    return NextResponse.json({ error: "No puedes cambiar el logo de otro profesional" }, { status: 403 });
  }

  const { data: profesional } = await supabase.from("profesionales").select("id, cuenta_id").eq("id", profesionalId).single();
  if (!profesional || profesional.cuenta_id !== perfil.cuenta_id) {
    return NextResponse.json({ error: "Profesional no encontrado en tu cuenta" }, { status: 404 });
  }

  const formData = await request.formData();
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }

  const extension = EXTENSION_POR_TIPO[archivo.type];
  if (!extension) {
    return NextResponse.json({ error: "Tipo de archivo no admitido (usa JPG o PNG)" }, { status: 400 });
  }
  if (archivo.size > LIMITE_BYTES) {
    return NextResponse.json({ error: "El archivo supera el límite de 2 MB" }, { status: 400 });
  }

  const admin = createAdminClient();
  const ruta = `${perfil.cuenta_id}/${randomUUID()}.${extension}`;
  const bytes = await archivo.arrayBuffer();

  const { error: errorSubida } = await admin.storage.from("profesionales-logos").upload(ruta, bytes, { contentType: archivo.type });
  if (errorSubida) {
    return NextResponse.json({ error: `No se pudo subir el archivo: ${errorSubida.message}` }, { status: 500 });
  }

  const { data: publica } = admin.storage.from("profesionales-logos").getPublicUrl(ruta);

  await admin.from("profesionales").update({ logo_url: publica.publicUrl }).eq("id", profesionalId);

  return NextResponse.json({ url: publica.publicUrl });
}
