import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cifrar } from "@/lib/cifrado";

const CLAVES_VALIDAS = ["openai_api_key", "anthropic_api_key"] as const;

// Guarda/rota una API key de plataforma (modo "platform_key" del agente).
// Solo super_admin -- se valida el rol aquí además de la política RLS de la
// tabla, igual que en /api/cuentas.
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", user.id).single();

  if (perfil?.rol !== "super_admin") {
    return NextResponse.json({ error: "Solo un super admin puede hacer esto" }, { status: 403 });
  }

  const { clave, valor, vence_en } = await request.json();

  if (!CLAVES_VALIDAS.includes(clave)) {
    return NextResponse.json({ error: "Clave inválida" }, { status: 400 });
  }

  if (!valor?.trim()) {
    return NextResponse.json({ error: "Falta el valor de la API key" }, { status: 400 });
  }

  const { error } = await supabase.from("plataforma_secretos").upsert(
    {
      clave,
      valor_cifrado: cifrar(valor.trim()),
      vence_en: vence_en || null,
      actualizado_por: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "clave" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
