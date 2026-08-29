import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Ruta propia para verificar los links de correo (reset de contraseña, alta
// de usuario, etc). En vez de dejar que el enlace del correo apunte directo
// al dominio de Supabase (que solo redirige de vuelta si la URL está en la
// lista blanca de "Redirect URLs" del proyecto — y si no coincide exacto,
// cae en silencio al Site URL, que es justo el bug reportado: termina en
// /login), la plantilla de correo debe apuntar aquí con el token_hash, y
// esta ruta lo verifica directo contra la API de Supabase y ya deja la
// sesión puesta en cookies antes de redirigir. No depende de esa lista
// blanca ni de si el flujo del cliente es PKCE o implícito.
type TipoOtp = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as TipoOtp | null;
  const next = searchParams.get("next") ?? "/";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/recuperar?error=link_invalido", request.url));
}
