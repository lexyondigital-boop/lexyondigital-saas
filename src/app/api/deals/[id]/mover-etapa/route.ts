import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

// Ruta dedicada al drag-drop del tablero Kanban -- separada de la edición
// general para poder loguear específicamente "de qué etapa a cuál" en el
// timeline del deal, y para actualizar ultima_actividad_en (el conteo de
// "deals dormidos" depende de este campo).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_deals");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { etapa_id } = (await request.json()) as { etapa_id?: string };

  if (!etapa_id) {
    return NextResponse.json({ error: "Falta la etapa destino" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: deal } = await admin.from("deals").select("etapa_id").eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id).maybeSingle();
  if (!deal) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const [{ data: etapaOrigen }, { data: etapaDestino }] = await Promise.all([
    admin.from("etapas_pipeline").select("nombre").eq("id", deal.etapa_id).maybeSingle(),
    admin.from("etapas_pipeline").select("nombre").eq("id", etapa_id).eq("cuenta_id", auth.perfil.cuenta_id).maybeSingle(),
  ]);

  if (!etapaDestino) return NextResponse.json({ error: "Etapa destino inválida" }, { status: 400 });

  const { error } = await admin
    .from("deals")
    .update({ etapa_id, ultima_actividad_en: new Date().toISOString() })
    .eq("id", id)
    .eq("cuenta_id", auth.perfil.cuenta_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "move_deal_stage",
    recursoTipo: "deal",
    recursoId: id,
    detalles: { etapa_origen: etapaOrigen?.nombre ?? null, etapa_destino: etapaDestino.nombre },
    request,
  });

  return NextResponse.json({ ok: true });
}
