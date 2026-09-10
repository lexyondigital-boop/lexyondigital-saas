import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { buscarPerfilPorEmail } from "@/lib/buscar-perfil-por-email";

// Da acceso adicional a esta cuenta a un usuario que YA existe (de casa)
// en cualquier otra cuenta -- no crea un usuario nuevo, solo lo vincula.
// Solo el super admin puede hacerlo (ver RLS de membresias_cuenta). Mismo
// comportamiento que /api/usuarios/membresia (autoservicio de la propia
// sub-cuenta), pero aquí la cuenta viene de la URL en vez de la sesión.
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

  const encontrado = await buscarPerfilPorEmail(admin, email);
  if (!encontrado) {
    return NextResponse.json({ error: "No existe ningún usuario con ese correo todavía -- créalo primero en alguna cuenta" }, { status: 404 });
  }
  if (encontrado.cuentaId === id) {
    return NextResponse.json({ error: "Ese usuario ya pertenece de casa a esta cuenta" }, { status: 409 });
  }

  const { data: membresia, error } = await admin
    .from("membresias_cuenta")
    .upsert({ perfil_id: encontrado.perfilId, cuenta_id: id, rol, activo: true }, { onConflict: "perfil_id,cuenta_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, membresia });
}
