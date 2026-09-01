import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarActividad } from "@/lib/auditoria";

type AdminClient = ReturnType<typeof createAdminClient>;

// Extraído de la ruta de drag-drop del Kanban para poder reutilizarlo desde
// contextos sin request/usuario autenticado (el cron de campañas, al mover
// automáticamente un deal cuando se envía una plantilla con etapa destino).
export async function moverDealEtapa(
  admin: AdminClient,
  {
    dealId,
    cuentaId,
    etapaId,
    perfilId,
    request,
    detallesExtra,
  }: {
    dealId: string;
    cuentaId: string;
    etapaId: string | null;
    perfilId: string | null;
    request?: NextRequest;
    detallesExtra?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { data: deal } = await admin.from("deals").select("etapa_id").eq("id", dealId).eq("cuenta_id", cuentaId).maybeSingle();
  if (!deal) return { ok: false, error: "No encontrado" };

  const [{ data: etapaOrigen }, { data: etapaDestino }] = await Promise.all([
    deal.etapa_id ? admin.from("etapas_pipeline").select("nombre").eq("id", deal.etapa_id).maybeSingle() : Promise.resolve({ data: null }),
    etapaId ? admin.from("etapas_pipeline").select("nombre").eq("id", etapaId).eq("cuenta_id", cuentaId).maybeSingle() : Promise.resolve({ data: { nombre: "Sin etapa" } }),
  ]);

  if (etapaId && !etapaDestino) return { ok: false, error: "Etapa destino inválida" };

  const { error } = await admin
    .from("deals")
    .update({ etapa_id: etapaId, ultima_actividad_en: new Date().toISOString() })
    .eq("id", dealId)
    .eq("cuenta_id", cuentaId);

  if (error) return { ok: false, error: error.message };

  await registrarActividad({
    cuentaId,
    perfilId,
    accion: "move_deal_stage",
    recursoTipo: "deal",
    recursoId: dealId,
    detalles: { etapa_origen: etapaOrigen?.nombre ?? null, etapa_destino: etapaDestino?.nombre ?? null, ...detallesExtra },
    request,
  });

  return { ok: true };
}

// Deal abierto más reciente de un contacto -- no hay restricción de "un solo
// deal abierto por contacto" en el esquema, así que se toma el de actividad
// más reciente cuando hay más de uno.
export async function obtenerDealAbiertoDeContacto(admin: AdminClient, contactoId: string) {
  const { data } = await admin
    .from("deals")
    .select("id")
    .eq("contacto_id", contactoId)
    .eq("estado", "abierto")
    .order("ultima_actividad_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}
