import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extraerTextoSitioWeb } from "@/lib/documento-conocimiento";

// Conecta la página del negocio como fuente de conocimiento del agente: se
// extrae el texto visible de la URL indicada y se guarda para inyectarlo en
// el prompt (ver agente-ia-runtime.ts). El sitio puede cambiar después --
// para eso existe el endpoint de refresco en [id]/actualizar.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase.from("perfiles").select("cuenta_id").eq("id", user.id).single();
  if (!perfil) return NextResponse.json({ error: "Sin cuenta asociada" }, { status: 403 });

  const { nombre, url } = (await request.json()) as { nombre?: string; url?: string };

  if (!nombre?.trim() || !url?.trim()) {
    return NextResponse.json({ error: "Falta el nombre o la URL del sitio" }, { status: 400 });
  }

  const extraccion = await extraerTextoSitioWeb(url.trim());

  if (!extraccion.ok) {
    return NextResponse.json({ error: extraccion.error ?? "No se pudo leer esa página" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: fila, error } = await admin
    .from("agente_documentos")
    .insert({
      cuenta_id: perfil.cuenta_id,
      nombre_archivo: nombre.trim(),
      url: url.trim(),
      tipo_fuente: "sitio_web",
      contenido_extraido: extraccion.texto,
      estado_extraccion: "listo",
      error_extraccion: null,
      actualizado_contenido_en: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ documento: fila });
}
