import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Ruta propia para verificar los links de correo (reset de contraseña, alta
// de usuario, etc). En vez de dejar que el enlace del correo apunte directo
// al dominio de Supabase (que solo redirige de vuelta si la URL está en la
// lista blanca de "Redirect URLs" del proyecto — y si no coincide exacto,
// cae en silencio al Site URL), la plantilla de correo apunta aquí con el
// token_hash, y esta ruta lo verifica directo contra la API de Supabase.
//
// Las cookies de sesión se escriben directo sobre la respuesta de redirect
// (mismo patrón que src/lib/supabase/middleware.ts) en vez de usar el
// cliente de src/lib/supabase/server.ts: ese está pensado para Server
// Components, donde escribir cookies falla en silencio (try/catch a
// propósito) porque ahí de verdad no se puede — pero en un Route Handler si
// se puede y se debe, y depender del "no truena" no garantiza que la cookie
// quede pegada a ESTA respuesta en particular antes del redirect.
type TipoOtp = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as TipoOtp | null;
  const next = searchParams.get("next") ?? "/";

  if (tokenHash && type) {
    const response = NextResponse.redirect(new URL(next, request.url));

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      },
    );

    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return response;
    }
  }

  return NextResponse.redirect(new URL("/recuperar?error=link_invalido", request.url));
}
