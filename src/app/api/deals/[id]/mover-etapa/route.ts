import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { moverDealEtapa } from "@/lib/deals";

// Ruta dedicada al drag-drop del tablero Kanban -- separada de la edición
// general para poder loguear específicamente "de qué etapa a cuál" en el
// timeline del deal, y para actualizar ultima_actividad_en (el conteo de
// "deals dormidos" depende de este campo). La lógica vive en lib/deals.ts
// para poder reutilizarse desde el cron de campañas (envío de plantillas con
// etapa destino configurada).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_deals");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { etapa_id } = (await request.json()) as { etapa_id?: string | null };

  if (etapa_id === undefined) {
    return NextResponse.json({ error: "Falta la etapa destino" }, { status: 400 });
  }

  const admin = createAdminClient();
  // "Sin etapa" en el tablero manda etapa_id: null a propósito -- es un
  // destino válido (deal huérfano por una etapa borrada), no un error.
  const resultado = await moverDealEtapa(admin, {
    dealId: id,
    cuentaId: auth.perfil.cuenta_id,
    etapaId: etapa_id,
    perfilId: auth.user.id,
    request,
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.error === "No encontrado" ? 404 : 400 });
  }

  return NextResponse.json({ ok: true });
}
