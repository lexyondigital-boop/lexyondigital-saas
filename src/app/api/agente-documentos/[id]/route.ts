import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Borra también el archivo de Storage cuando aplica -- borrar solo la fila
// desde el browser (como se hacía antes de subir PDFs de verdad) dejaría el
// archivo huérfano en el bucket para siempre.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    .select("id, storage_path")
    .eq("id", id)
    .eq("cuenta_id", perfil.cuenta_id)
    .maybeSingle();

  if (!documento) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (documento.storage_path) {
    await admin.storage.from("agente-documentos").remove([documento.storage_path]);
  }

  const { error } = await admin.from("agente_documentos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
