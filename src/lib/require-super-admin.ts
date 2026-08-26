import { createClient } from "@/lib/supabase/server";

// Todas las rutas de administración de sub-cuentas repiten esta misma
// comprobación de sesión + rol — se centraliza aquí para no duplicarla en
// cada route handler.
export async function requireSuperAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "No autenticado" as const, status: 401 as const };
  }

  const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", user.id).single();

  if (perfil?.rol !== "super_admin") {
    return { error: "Solo un super admin puede hacer esto" as const, status: 403 as const };
  }

  return { user };
}
