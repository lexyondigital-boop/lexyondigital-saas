import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cifrar } from "@/lib/cifrado";

// El cifrado de la API key del cliente solo puede pasar por el servidor
// (el secreto AGENTE_IA_CIFRADO_SECRETO nunca debe llegar al navegador) --
// por eso esto es un route handler y no un upsert directo desde el browser
// como el resto de la configuración del agente.
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: perfil } = await supabase.from("perfiles").select("cuenta_id").eq("id", user.id).single();

  if (!perfil) {
    return NextResponse.json({ error: "Sin cuenta asociada" }, { status: 403 });
  }

  const { api_key } = await request.json();

  if (!api_key?.trim()) {
    return NextResponse.json({ error: "Falta la API key" }, { status: 400 });
  }

  const api_key_usuario_cifrada = cifrar(api_key.trim());

  const { error } = await supabase
    .from("agente_config")
    .upsert({ cuenta_id: perfil.cuenta_id, api_key_usuario_cifrada }, { onConflict: "cuenta_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
