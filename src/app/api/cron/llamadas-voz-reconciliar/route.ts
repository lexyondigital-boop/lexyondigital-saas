import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverApiKeyRetell, obtenerLlamadaRetell, procesarResultadoLlamadaVoz } from "@/lib/retell";

const ESTADOS_EN_CURSO_RETELL = new Set(["registered", "ongoing"]);

// Llamado por un cron externo (crontab en la VPS) cada 5 minutos. El
// webhook de Retell (call_ended/call_analyzed) no tiene entrega
// garantizada -- se confirmó empíricamente que algunas llamadas se quedan
// "en_progreso" en nuestra tabla aunque en Retell ya aparecen "ended". Este
// cron busca esas llamadas atoradas y las actualiza consultando
// directamente el estado real en Retell (get-call), en vez de depender
// solo del webhook.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Solo llamadas con al menos 3 minutos de antigüedad -- una llamada
  // recién creada todavía puede estar genuinamente en curso.
  const limiteAntiguedad = new Date(Date.now() - 3 * 60 * 1000).toISOString();

  const { data: atoradas, error } = await admin
    .from("llamadas_voz")
    .select("id, cuenta_id, contacto_id, conversacion_id, retell_call_id")
    .eq("status", "en_progreso")
    .lt("created_at", limiteAntiguedad)
    .not("retell_call_id", "is", null)
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!atoradas || atoradas.length === 0) return NextResponse.json({ ok: true, revisadas: 0, actualizadas: 0 });

  // Una key por cuenta_id -- varias llamadas atoradas pueden ser de la
  // misma sub-cuenta, no hace falta descifrar/resolver la key repetidas veces.
  const keysPorCuenta = new Map<string, string | null>();
  let actualizadas = 0;

  for (const llamada of atoradas) {
    if (!keysPorCuenta.has(llamada.cuenta_id)) {
      keysPorCuenta.set(llamada.cuenta_id, await resolverApiKeyRetell(admin, llamada.cuenta_id));
    }
    const apiKey = keysPorCuenta.get(llamada.cuenta_id);
    if (!apiKey || !llamada.retell_call_id) continue;

    const resultado = await obtenerLlamadaRetell(apiKey, llamada.retell_call_id);
    if (!resultado.ok) continue;
    if (ESTADOS_EN_CURSO_RETELL.has(resultado.call.call_status)) continue;

    await procesarResultadoLlamadaVoz(admin, llamada, resultado.call, true);
    actualizadas++;
  }

  return NextResponse.json({ ok: true, revisadas: atoradas.length, actualizadas });
}
