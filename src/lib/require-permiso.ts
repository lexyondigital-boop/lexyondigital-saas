import { createClient } from "@/lib/supabase/server";
import { obtenerPermisosEfectivos } from "@/lib/permisos-efectivos";

// Generaliza require-admin-cuenta.ts para rutas gateadas por un permiso
// granular (view_pipeline, manage_deals, etc.) en vez de por rol -- un
// vendedor con rol "agente" puede tener manage_deals concedido en
// perfil_permisos y sí debe poder usar estas rutas.
export async function requirePermiso(clave: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "No autenticado" as const, status: 401 as const };
  }

  const { data: perfil } = await supabase.from("perfiles").select("rol, cuenta_id").eq("id", user.id).single();

  if (!perfil) {
    return { error: "Sin cuenta asociada" as const, status: 403 as const };
  }

  const permisos = await obtenerPermisosEfectivos(user.id, perfil.rol as "super_admin" | "admin" | "agente");

  if (!permisos[clave]) {
    return { error: "No tienes permiso para hacer esto" as const, status: 403 as const };
  }

  return { user, perfil };
}
