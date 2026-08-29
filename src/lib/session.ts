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

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol, nombre, cuenta_id, activo")
    .eq("id", user.id)
    .maybeSingle<Perfil>();

  if (!perfil || !perfil.activo) {
    redirect("/sin-acceso");
  }

  const permisos = await obtenerPermisosEfectivos(user.id, perfil.rol);

  return { user, perfil, permisos };
}
