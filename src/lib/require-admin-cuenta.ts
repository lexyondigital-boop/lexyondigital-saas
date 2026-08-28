import { createClient } from "@/lib/supabase/server";

// Usado por las rutas de Usuarios/Equipos: el admin (o super_admin) de la
// PROPIA cuenta puede gestionar su equipo, a diferencia de
// require-super-admin.ts que es exclusivo del panel de sub-cuentas.
export async function requireAdminCuenta() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "No autenticado" as const, status: 401 as const };
  }

  const { data: perfil } = await supabase.from("perfiles").select("rol, cuenta_id").eq("id", user.id).single();

  if (!perfil || (perfil.rol !== "admin" && perfil.rol !== "super_admin")) {
    return { error: "Solo un administrador puede hacer esto" as const, status: 403 as const };
  }

  return { user, perfil };
}
