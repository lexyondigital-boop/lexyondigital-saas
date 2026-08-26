import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente con service_role: ignora RLS. Solo para uso en servidor, en
// webhooks (Meta) y el cron de campañas, donde no hay sesión de usuario.
// Nunca importar este archivo desde código que corre en el navegador.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
