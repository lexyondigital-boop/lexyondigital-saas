import type { createClient } from "@/lib/supabase/server";

export type PerfilActivo = {
  rol: "super_admin" | "admin" | "agente";
  nombre: string | null;
  cuenta_id: string;
  activo: boolean;
};

// Resuelve el perfil "activo" de un usuario ya autenticado: su perfil de
// casa, salvo que haya cambiado a otra cuenta (ver /api/auth/cambiar-cuenta)
// y esa membresía siga siendo válida -- en ese caso, el rol y cuenta_id de
// esa membresía. Comparte la misma lógica que cuenta_id_actual()/
// rol_actual() del lado de Postgres (RLS) -- antes cada guard de rutas
// (requirePermiso, requireAdminCuenta) resolvía el perfil directo de
// "perfiles", así que una acción de escritura hecha después de cambiar de
// cuenta con el selector se aplicaba silenciosamente a la cuenta de casa en
// vez de la cuenta activa que la persona veía en pantalla.
export async function resolverPerfilActivo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  appMetadata: Record<string, unknown> | undefined,
): Promise<PerfilActivo | null> {
  const { data: perfilCasa } = await supabase
    .from("perfiles")
    .select("rol, nombre, cuenta_id, activo")
    .eq("id", userId)
    .maybeSingle<PerfilActivo>();

  if (!perfilCasa) return null;

  const cuentaReclamada = (appMetadata as { cuenta_activa?: string } | undefined)?.cuenta_activa;
  if (cuentaReclamada && cuentaReclamada !== perfilCasa.cuenta_id) {
    const { data: membresia } = await supabase
      .from("membresias_cuenta")
      .select("rol, cuenta_id, activo")
      .eq("perfil_id", userId)
      .eq("cuenta_id", cuentaReclamada)
      .eq("activo", true)
      .maybeSingle();

    if (membresia) {
      return { rol: membresia.rol as PerfilActivo["rol"], nombre: perfilCasa.nombre, cuenta_id: membresia.cuenta_id, activo: true };
    }
  }

  return perfilCasa;
}
