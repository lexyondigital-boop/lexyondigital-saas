import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extraerTextoPdf, LIMITE_TAMANO_PDF_BYTES } from "@/lib/documento-conocimiento";

// Sube el PDF de verdad a Storage (antes "Documentos" solo guardaba un link
// externo que el agente ni siquiera leía) y extrae su texto en el momento --
// así el agente puede usarlo como conocimiento real desde la primera consulta.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase.from("perfiles").select("cuenta_id").eq("id", user.id).single();
  if (!perfil) return NextResponse.json({ error: "Sin cuenta asociada" }, { status: 403 });

  const formData = await request.formData();
  const archivo = formData.get("archivo");
  const nombre = (formData.get("nombre") as string | null)?.trim();

  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo PDF" }, { status: 400 });
  }
  if (!nombre) {
    return NextResponse.json({ error: "Falta el nombre del documento" }, { status: 400 });
  }
  if (archivo.type !== "application/pdf" && !archivo.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Solo se admiten archivos PDF" }, { status: 400 });
  }
  if (archivo.size > LIMITE_TAMANO_PDF_BYTES) {
    return NextResponse.json({ error: `El PDF supera el límite de ${LIMITE_TAMANO_PDF_BYTES / 1024 / 1024} MB` }, { status: 400 });
  }

  const bytes = await archivo.arrayBuffer();
  const admin = createAdminClient();
  const ruta = `${perfil.cuenta_id}/${randomUUID()}.pdf`;

  const { error: errorSubida } = await admin.storage
    .from("agente-documentos")
    .upload(ruta, bytes, { contentType: "application/pdf" });

  if (errorSubida) {
    return NextResponse.json({ error: `No se pudo subir el archivo: ${errorSubida.message}` }, { status: 500 });
  }

  const { data: publica } = admin.storage.from("agente-documentos").getPublicUrl(ruta);
  const extraccion = await extraerTextoPdf(bytes);

  const { data: fila, error: errorInsert } = await admin
    .from("agente_documentos")
    .insert({
      cuenta_id: perfil.cuenta_id,
      nombre_archivo: nombre,
      url: publica.publicUrl,
      tipo_fuente: "documento",
      storage_path: ruta,
      contenido_extraido: extraccion.texto,
      estado_extraccion: extraccion.ok ? "listo" : "error",
      error_extraccion: extraccion.error,
      actualizado_contenido_en: new Date().toISOString(),
    })
    .select()
    .single();

  if (errorInsert) {
    // El archivo ya se subió a Storage -- se limpia para no dejar un
    // huérfano si el insert en la tabla falla (ej. RLS, columna duplicada).
    await admin.storage.from("agente-documentos").remove([ruta]);
    return NextResponse.json({ error: errorInsert.message }, { status: 500 });
  }

  return NextResponse.json({ documento: fila });
}
