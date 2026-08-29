import { createClient } from "@/lib/supabase/server";

// admin/super_admin tienen todo por defecto, agente nada por defecto;
// perfil_permisos guarda las excepciones puntuales a esa regla (ver
// supabase/migrations/20260901000000_usuarios_permisos.sql). Esto calcula
// el resultado final para un perfil, para que las pantallas de verdad
// respeten lo que el admin marcó en Usuarios en vez de solo guardarlo.
export async function obtenerPermisosEfectivos(
  perfilId: string,
  rol: "super_admin" | "admin" | "agente",
): Promise<Record<string, boolean>> {
  const supabase = await createClient();
  const { data: catalogo } = await supabase.from("permisos_catalogo").select("clave");
  const claves = (catalogo ?? []).map((c) => c.clave);

  if (rol === "super_admin") {
    return Object.fromEntries(claves.map((clave) => [clave, true]));
  }

  const { data: overrides } = await supabase
    .from("perfil_permisos")
    .select("permiso_clave, concedido")
    .eq("perfil_id", perfilId);

  const overrideMap = new Map((overrides ?? []).map((o) => [o.permiso_clave, o.concedido]));

  const permisos: Record<string, boolean> = {};
  for (const clave of claves) {
    permisos[clave] = overrideMap.has(clave) ? overrideMap.get(clave)! : rol === "admin";
  }
  return permisos;
}
