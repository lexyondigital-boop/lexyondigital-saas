import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type PerfilPorEmail = { perfilId: string; cuentaId: string; cuentaNombre: string };

// No hay un "buscar por email" directo en la API de Supabase Auth -- se
// pagina la lista de usuarios y se busca por coincidencia exacta. Se usa al
// crear un usuario (¿ya existe en otra cuenta?) y al dar acceso adicional
// (¿a quién exactamente?).
export async function buscarPerfilPorEmail(admin: AdminClient, email: string): Promise<PerfilPorEmail | null> {
  let perfilId: string | null = null;
  let pagina = 1;
  while (!perfilId) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error || data.users.length === 0) break;
    const encontrado = data.users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
    if (encontrado) perfilId = encontrado.id;
    if (data.users.length < 200) break;
    pagina++;
  }

  if (!perfilId) return null;

  const { data: perfil } = await admin.from("perfiles").select("cuenta_id").eq("id", perfilId).maybeSingle();
  if (!perfil) return null;

  const { data: cuenta } = await admin.from("cuentas").select("nombre").eq("id", perfil.cuenta_id).maybeSingle();

  return { perfilId, cuentaId: perfil.cuenta_id, cuentaNombre: cuenta?.nombre ?? "otra cuenta" };
}
