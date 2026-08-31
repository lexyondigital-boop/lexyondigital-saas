import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

// Cierra un deal como ganado o perdido. El monto final es opcional (el
// usuario pidió explícitamente poder registrar la ganancia/pérdida en
// valores absolutos, pero con la posibilidad de ajustar el monto de la
// oportunidad de forma opcional) -- si no se manda valor_final, se conserva
// el valor que ya tenía el deal en el pipeline.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_deals");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { estado, motivo_cierre, valor_final } = (await request.json()) as {
    estado?: "ganado" | "perdido";
    motivo_cierre?: string;
    valor_final?: number;
  };

  if (estado !== "ganado" && estado !== "perdido") {
    return NextResponse.json({ error: "estado debe ser 'ganado' o 'perdido'" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Si la cuenta tiene una etapa marcada como "es_ganada"/"es_perdida", el
  // deal se mueve ahí para que el tablero refleje el cierre visualmente --
  // si no existe una etapa así configurada, el deal solo cambia de estado
  // sin moverse de columna.
  const { data: etapaTerminal } = await admin
    .from("etapas_pipeline")
    .select("id")
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .eq(estado === "ganado" ? "es_ganada" : "es_perdida", true)
    .limit(1)
    .maybeSingle();

  const cambios: Record<string, unknown> = {
    estado,
    motivo_cierre: motivo_cierre?.trim() || null,
    ultima_actividad_en: new Date().toISOString(),
  };
  if (typeof valor_final === "number") cambios.valor = valor_final;
  if (etapaTerminal) cambios.etapa_id = etapaTerminal.id;

  const { error } = await admin.from("deals").update(cambios).eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: estado === "ganado" ? "close_deal_won" : "close_deal_lost",
    recursoTipo: "deal",
    recursoId: id,
    detalles: { motivo_cierre: cambios.motivo_cierre, valor_final: cambios.valor ?? null },
    request,
  });

  return NextResponse.json({ ok: true });
}
