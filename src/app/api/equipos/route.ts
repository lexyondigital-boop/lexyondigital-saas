import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminCuenta } from "@/lib/require-admin-cuenta";
import { registrarActividad } from "@/lib/auditoria";

export async function POST(request: NextRequest) {
  const auth = await requireAdminCuenta();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { nombre, descripcion, color } = await request.json();

  if (!nombre?.trim()) {
    return NextResponse.json({ error: "Falta el nombre del equipo" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("equipos")
    .insert({
      cuenta_id: auth.perfil.cuenta_id,
      nombre: nombre.trim(),
      descripcion: descripcion?.trim() || null,
      color: color || "#8b5cf6",
      creado_por: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message.includes("duplicate") ? "Ya existe un equipo con ese nombre." : error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "create_team",
    recursoTipo: "team",
    recursoId: data.id,
    detalles: { nombre: nombre.trim() },
    request,
  });

  return NextResponse.json({ ok: true, equipo: data });
}
