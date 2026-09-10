import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminCuenta } from "@/lib/require-admin-cuenta";
import { buscarPerfilPorEmail } from "@/lib/buscar-perfil-por-email";
import { registrarActividad } from "@/lib/auditoria";

// Versión de autoservicio de /api/cuentas/[id]/membresias -- el admin de la
// PROPIA cuenta (activa) le da acceso adicional a un usuario que ya existe
// en otra cuenta. La cuenta destino siempre es la del que llama
// (auth.perfil.cuenta_id), nunca una recibida del cliente -- así un admin
// de sub-cuenta solo puede dar acceso a SU cuenta, jamás a otra.
export async function POST(request: NextRequest) {
  const auth = await requireAdminCuenta();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { email, rol } = await request.json();

  if (!email?.trim()) return NextResponse.json({ error: "Falta el correo" }, { status: 400 });
  if (rol !== "admin" && rol !== "agente") return NextResponse.json({ error: "Rol inválido" }, { status: 400 });

  const admin = createAdminClient();

  const encontrado = await buscarPerfilPorEmail(admin, email);
  if (!encontrado) {
    return NextResponse.json({ error: "No existe ningún usuario con ese correo todavía" }, { status: 404 });
  }
  if (encontrado.cuentaId === auth.perfil.cuenta_id) {
    return NextResponse.json({ error: "Ese usuario ya pertenece de casa a esta cuenta" }, { status: 409 });
  }

  const { data: membresia, error } = await admin
    .from("membresias_cuenta")
    .upsert({ perfil_id: encontrado.perfilId, cuenta_id: auth.perfil.cuenta_id, rol, activo: true }, { onConflict: "perfil_id,cuenta_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "grant_membresia",
    recursoTipo: "user",
    recursoId: encontrado.perfilId,
    detalles: { email: email.trim(), rol },
    request,
  });

  return NextResponse.json({ ok: true, membresia });
}
