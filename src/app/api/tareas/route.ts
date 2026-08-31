import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

export async function POST(request: NextRequest) {
  const auth = await requirePermiso("manage_deals");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { deal_id, tipo, titulo, descripcion, fecha_vencimiento, asignado_a } = await request.json();

  if (!deal_id || !titulo?.trim() || !fecha_vencimiento) {
    return NextResponse.json({ error: "Faltan datos de la tarea (deal, título o fecha)" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: deal } = await admin.from("deals").select("id").eq("id", deal_id).eq("cuenta_id", auth.perfil.cuenta_id).maybeSingle();
  if (!deal) return NextResponse.json({ error: "Deal no encontrado" }, { status: 404 });

  const { data, error } = await admin
    .from("tareas")
    .insert({
      cuenta_id: auth.perfil.cuenta_id,
      deal_id,
      tipo: tipo || "otro",
      titulo: titulo.trim(),
      descripcion: descripcion?.trim() || null,
      fecha_vencimiento,
      asignado_a: asignado_a || auth.user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "create_task",
    recursoTipo: "deal",
    recursoId: deal_id,
    detalles: { titulo: titulo.trim(), tipo: tipo || "otro", fecha_vencimiento },
    request,
  });

  return NextResponse.json({ ok: true, tarea: data });
}
