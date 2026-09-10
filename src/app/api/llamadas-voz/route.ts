import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { resolverCuentaRetell, crearLlamadaRetell, telefonoAE164 } from "@/lib/retell";
import { obtenerOCrearConversacion } from "@/lib/conversaciones";
import { detectarClavesEnPrompt } from "@/lib/agente-prompt-variables";
import { obtenerValoresContactoPorClave } from "@/lib/variables-contacto";

// Historial de llamadas para el panel de Agentes de Voz de esta cuenta.
export async function GET(_request: NextRequest) {
  const auth = await requirePermiso("view_agentes_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("llamadas_voz")
    .select(
      "id, status, resultado, duracion_segundos, transcripcion, audio_url, created_at, contacto:contactos(nombre, telefono), plantilla:plantillas_voz(nombre, agente_tipo, categoria)",
    )
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ llamadas: data ?? [] });
}

// Dispara una llamada manual con una plantilla de voz desde una
// conversación abierta -- mismo espíritu que /api/messages/send con
// tipo "template", pero para Retell en vez de WhatsApp.
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { conversacion_id, contacto_id, plantilla_voz_id } = (await request.json()) as {
    conversacion_id?: string;
    contacto_id?: string;
    plantilla_voz_id?: string;
  };

  if (!conversacion_id && !contacto_id) {
    return NextResponse.json({ error: "Falta conversacion_id o contacto_id" }, { status: 400 });
  }
  if (!plantilla_voz_id) {
    return NextResponse.json({ error: "Falta plantilla_voz_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  let conversacion: { id: string; cuenta_id: string; telefono: string; contacto_id: string | null };

  if (conversacion_id) {
    // Pasa por RLS con la sesión del usuario: si la conversación no
    // pertenece a su cuenta, simplemente no aparece.
    const { data, error: conversacionError } = await supabase
      .from("conversaciones")
      .select("id, cuenta_id, telefono, contacto_id")
      .eq("id", conversacion_id)
      .single();

    if (conversacionError || !data) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }
    conversacion = data;
  } else {
    // Igual pasa por RLS -- se usa desde el botón "Enviar plantilla de voz"
    // de la tabla de Contactos, donde todavía no existe ninguna conversación.
    const { data: contacto, error: contactoError } = await supabase
      .from("contactos")
      .select("id, cuenta_id, telefono")
      .eq("id", contacto_id)
      .single();

    if (contactoError || !contacto) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    const nueva = await obtenerOCrearConversacion(admin, contacto.cuenta_id, contacto.id, contacto.telefono);
    if (!nueva) {
      return NextResponse.json({ error: "No se pudo abrir la conversación" }, { status: 500 });
    }
    conversacion = { id: nueva.id, cuenta_id: contacto.cuenta_id, telefono: contacto.telefono, contacto_id: contacto.id };
  }

  const { data: plantilla } = await admin
    .from("plantillas_voz")
    .select("id, publicada, retell_agent_id, retell_numero_saliente, copyscript, objetivo")
    .eq("id", plantilla_voz_id)
    .eq("cuenta_id", conversacion.cuenta_id)
    .maybeSingle();

  if (!plantilla || !plantilla.publicada) {
    return NextResponse.json({ error: "Plantilla de voz no encontrada o no publicada" }, { status: 400 });
  }
  if (!plantilla.retell_agent_id) {
    return NextResponse.json({ error: "Esta plantilla todavía no tiene un agente de Retell configurado" }, { status: 409 });
  }

  const cuentaRetell = await resolverCuentaRetell(admin, conversacion.cuenta_id);
  if ("error" in cuentaRetell) {
    return NextResponse.json({ error: cuentaRetell.error }, { status: 409 });
  }

  // El número de la plantilla (asignado por sub-cuenta y por plantilla) tiene
  // prioridad -- el de la cuenta es el respaldo de siempre (modo propia, o
  // agentes creados antes de este sistema).
  const numeroSaliente = plantilla.retell_numero_saliente ?? cuentaRetell.numeroSaliente;
  if (!numeroSaliente) {
    return NextResponse.json({ error: "Falta elegir el número saliente de Retell en Configuración → Integraciones" }, { status: 409 });
  }

  if (conversacion.contacto_id) {
    const desde = new Date(Date.now() - cuentaRetell.intervaloMinimoLlamadas * 60_000).toISOString();
    const { data: llamadaReciente } = await admin
      .from("llamadas_voz")
      .select("id")
      .eq("contacto_id", conversacion.contacto_id)
      .gte("created_at", desde)
      .limit(1)
      .maybeSingle();
    if (llamadaReciente) {
      return NextResponse.json(
        { error: `Espera al menos ${cuentaRetell.intervaloMinimoLlamadas} minutos antes de volver a llamar a este contacto` },
        { status: 429 },
      );
    }
  }

  const { data: llamada, error: llamadaError } = await admin
    .from("llamadas_voz")
    .insert({
      cuenta_id: conversacion.cuenta_id,
      contacto_id: conversacion.contacto_id,
      conversacion_id: conversacion.id,
      plantilla_voz_id: plantilla.id,
      status: "en_progreso",
    })
    .select()
    .single();

  if (llamadaError) return NextResponse.json({ error: llamadaError.message }, { status: 500 });

  // {{clave}} del Copyscript que ya tengan un valor real para este contacto
  // -- Retell las sustituye en el prompt antes de que la llamada empiece.
  const claves = detectarClavesEnPrompt([plantilla.objetivo, plantilla.copyscript].filter(Boolean).join("\n\n"));
  const dynamicVariables =
    claves.length > 0 && conversacion.contacto_id
      ? await obtenerValoresContactoPorClave(admin, conversacion.cuenta_id, conversacion.contacto_id, claves)
      : undefined;

  const resultado = await crearLlamadaRetell(cuentaRetell.apiKey, {
    fromNumber: numeroSaliente,
    toNumber: telefonoAE164(conversacion.telefono),
    metadata: { cuenta_id: conversacion.cuenta_id, llamada_voz_id: llamada.id },
    overrideAgentId: plantilla.retell_agent_id,
    dynamicVariables,
  });

  if (!resultado.ok) {
    await admin.from("llamadas_voz").update({ status: "fallida", actualizado_at: new Date().toISOString() }).eq("id", llamada.id);
    return NextResponse.json({ error: resultado.error }, { status: 502 });
  }

  await admin.from("llamadas_voz").update({ retell_call_id: resultado.callId }).eq("id", llamada.id);

  return NextResponse.json({ ok: true, llamada_id: llamada.id, conversacion_id: conversacion.id });
}
