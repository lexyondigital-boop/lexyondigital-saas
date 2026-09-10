import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerPermisosEfectivos } from "@/lib/permisos-efectivos";
import { resolverPerfilActivo, type PerfilActivo } from "@/lib/perfil-activo";

export type Perfil = PerfilActivo;

// Todas las páginas del portal (tanto del super admin como del CRM de cada
// sub-cuenta) repiten esta misma comprobación de sesión + perfil activo.
export async function obtenerSesionApp() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const perfil = await resolverPerfilActivo(supabase, user.id, user.app_metadata);

  if (!perfil) {
    redirect("/sin-acceso");
  }

  if (!perfil.activo) {
    redirect("/sin-acceso");
  }

  const permisos = await obtenerPermisosEfectivos(user.id, perfil.rol);

  return { user, perfil, permisos };
}
