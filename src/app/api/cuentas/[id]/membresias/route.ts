import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/require-super-admin";

// Da acceso adicional a esta cuenta a un usuario que YA existe (de casa)
// en cualquier otra cuenta -- no crea un usuario nuevo, solo lo vincula.
// Solo el super admin puede hacerlo (ver RLS de membresias_cuenta).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { email, rol } = await request.json();

  if (!email?.trim()) return NextResponse.json({ error: "Falta el correo" }, { status: 400 });
  if (rol !== "admin" && rol !== "agente") return NextResponse.json({ error: "Rol inválido" }, { status: 400 });

  const admin = createAdminClient();

  const { data: cuenta } = await admin.from("cuentas").select("id").eq("id", id).maybeSingle();
  if (!cuenta) return NextResponse.json({ error: "Sub-cuenta no encontrada" }, { status: 404 });

  // No hay un "buscar por email" directo en la API de Supabase Auth --
  // se pagina la lista de usuarios y se busca por coincidencia exacta.
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

  if (!perfilId) {
    return NextResponse.json({ error: "No existe ningún usuario con ese correo todavía -- créalo primero en alguna cuenta" }, { status: 404 });
  }

  const { data: perfil } = await admin.from("perfiles").select("cuenta_id").eq("id", perfilId).maybeSingle();
  if (!perfil) {
    return NextResponse.json({ error: "Ese correo no tiene un perfil válido" }, { status: 409 });
  }
  if (perfil.cuenta_id === id) {
    return NextResponse.json({ error: "Ese usuario ya pertenece de casa a esta cuenta" }, { status: 409 });
  }

  const { data: membresia, error } = await admin
    .from("membresias_cuenta")
    .upsert({ perfil_id: perfilId, cuenta_id: id, rol, activo: true }, { onConflict: "perfil_id,cuenta_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, membresia });
}
