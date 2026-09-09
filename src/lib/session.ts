import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerPermisosEfectivos } from "@/lib/permisos-efectivos";

export type Perfil = {
  rol: "super_admin" | "admin" | "agente";
  nombre: string | null;
  cuenta_id: string;
  activo: boolean;
};

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

  const { data: perfilCasa } = await supabase
    .from("perfiles")
    .select("rol, nombre, cuenta_id, activo")
    .eq("id", user.id)
    .maybeSingle<Perfil>();

  if (!perfilCasa) {
    redirect("/sin-acceso");
  }

  // Si el usuario cambió a otra cuenta (ver /api/auth/cambiar-cuenta), el
  // JWT trae app_metadata.cuenta_activa -- se resuelve el rol para ESA
  // cuenta desde membresias_cuenta, igual que hace cuenta_id_actual() del
  // lado de Postgres/RLS. Si no hay cuenta activa distinta o la membresía
  // ya no es válida, se usa el perfil de casa de siempre.
  let perfil: Perfil = perfilCasa;
  const cuentaReclamada = (user.app_metadata as { cuenta_activa?: string } | undefined)?.cuenta_activa;

  if (cuentaReclamada && cuentaReclamada !== perfilCasa.cuenta_id) {
    const { data: membresia } = await supabase
      .from("membresias_cuenta")
      .select("rol, cuenta_id, activo")
      .eq("perfil_id", user.id)
      .eq("cuenta_id", cuentaReclamada)
      .eq("activo", true)
      .maybeSingle();

    if (membresia) {
      perfil = { rol: membresia.rol as Perfil["rol"], nombre: perfilCasa.nombre, cuenta_id: membresia.cuenta_id, activo: true };
    }
  }

  if (!perfil.activo) {
    redirect("/sin-acceso");
  }

  const permisos = await obtenerPermisosEfectivos(user.id, perfil.rol);

  return { user, perfil, permisos };
}
