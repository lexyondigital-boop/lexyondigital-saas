import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activarNotificacionesGoogle, detenerNotificacionesGoogle } from "@/lib/google-calendar";
import { origenPublico } from "@/lib/origen-publico";

// Llamado por un cron externo (crontab en la VPS), un par de veces al día.
// Los canales de notificaciones de Google (events.watch) expiran solos
// (~1 semana) -- esto renueva los que están por vencer (o nunca se
// activaron) para que la sincronización en tiempo real no se corte sola.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const webhookUrl = `${origenPublico(request)}/api/webhooks/google-calendar`;

  const { data: profesionales } = await admin
    .from("profesionales")
    .select(
      "id, google_calendar_id, google_oauth_token_cifrado, google_oauth_expires_at, google_channel_id, google_channel_resource_id, google_channel_expira_at",
    )
    .not("google_oauth_token_cifrado", "is", null);

  const en24h = Date.now() + 24 * 60 * 60 * 1000;
  const resultados = [];

  for (const p of profesionales ?? []) {
    const expiraPronto = !p.google_channel_expira_at || new Date(p.google_channel_expira_at).getTime() < en24h;
    if (!expiraPronto) continue;

    if (p.google_channel_id && p.google_channel_resource_id) {
      await detenerNotificacionesGoogle({ profesional: p });
    }

    const canal = await activarNotificacionesGoogle({ profesional: p, webhookUrl });

    if (canal) {
      await admin
        .from("profesionales")
        .update({
          google_channel_id: canal.channelId,
          google_channel_resource_id: canal.resourceId,
          google_channel_token: canal.token,
          google_channel_expira_at: canal.expiracion.toISOString(),
        })
        .eq("id", p.id);
      resultados.push({ profesional_id: p.id, renovado: true });
    } else {
      resultados.push({ profesional_id: p.id, renovado: false });
    }
  }

  return NextResponse.json({ ok: true, procesados: resultados.length, resultados });
}
