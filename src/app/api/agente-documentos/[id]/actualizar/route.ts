import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extraerTextoSitioWeb } from "@/lib/documento-conocimiento";

// Vuelve a leer un sitio web conectado -- el contenido de una página puede
// cambiar después de la primera conexión, a diferencia de un PDF subido, que
// es estático (para "actualizar" un PDF hay que borrarlo y subir uno nuevo).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase.from("perfiles").select("cuenta_id").eq("id", user.id).single();
  if (!perfil) return NextResponse.json({ error: "Sin cuenta asociada" }, { status: 403 });

  const admin = createAdminClient();
  const { data: documento } = await admin
    .from("agente_documentos")
    .select("id, url, tipo_fuente")
    .eq("id", id)
    .eq("cuenta_id", perfil.cuenta_id)
    .maybeSingle();

  if (!documento) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (documento.tipo_fuente !== "sitio_web") {
    return NextResponse.json({ error: "Solo los sitios web conectados se pueden actualizar -- reemplaza el PDF subiendo uno nuevo." }, { status: 400 });
  }

  const extraccion = await extraerTextoSitioWeb(documento.url);

  const { data: fila, error } = await admin
    .from("agente_documentos")
    .update({
      contenido_extraido: extraccion.texto,
      estado_extraccion: extraccion.ok ? "listo" : "error",
      error_extraccion: extraccion.error,
      actualizado_contenido_en: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ documento: fila });
}
