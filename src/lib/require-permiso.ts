import { createClient } from "@/lib/supabase/server";
import { obtenerPermisosEfectivos } from "@/lib/permisos-efectivos";
import { resolverPerfilActivo } from "@/lib/perfil-activo";

// Generaliza require-admin-cuenta.ts para rutas gateadas por un permiso
// granular (view_pipeline, manage_deals, etc.) en vez de por rol -- un
// vendedor con rol "agente" puede tener manage_deals concedido en
// perfil_permisos y sí debe poder usar estas rutas.
// Acepta una clave o varias. Con varias las exige todas: cargar contactos a
// una campaña, por ejemplo, es editar la campaña Y meter contactos a la
// cuenta, y hay quien debe poder lo primero pero no lo segundo.
export async function requirePermiso(clave: string | string[]) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "No autenticado" as const, status: 401 as const };
  }

  const perfil = await resolverPerfilActivo(supabase, user.id, user.app_metadata);

  if (!perfil) {
    return { error: "Sin cuenta asociada" as const, status: 403 as const };
  }

  const permisos = await obtenerPermisosEfectivos(user.id, perfil.rol);

  const requeridas = Array.isArray(clave) ? clave : [clave];
  if (requeridas.some((c) => !permisos[c])) {
    return { error: "No tienes permiso para hacer esto" as const, status: 403 as const };
  }

  return { user, perfil };
}
