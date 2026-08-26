import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente con la sesión del usuario autenticado. Usar en Server Components,
// Server Actions y Route Handlers que responden a un usuario logueado.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component sin permiso de escritura;
            // el middleware ya se encarga de refrescar la sesión.
          }
        },
      },
    },
  );
}
