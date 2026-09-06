import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";
import { sincronizarPlantillaVozConRetell, resolverApiKeyRetell, asegurarWebhookAgente, type FuncionRetell } from "@/lib/retell";
import { origenPublico } from "@/lib/origen-publico";
import { validarConfiguracionLlamada } from "@/lib/plantillas-voz";

const AGENTES_TIPO_DISPONIBLES = ["servicio"] as const;
const MODOS_AGENTE = ["generado", "retell_propio"] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_plantillas_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json();
  const {
    nombre,
    copyscript,
    objetivo,
    agente_tipo,
    categoria,
    publicada,
    modo_agente,
    retell_agent_id,
    retell_voice_id,
    retell_idioma,
    retell_colgar_buzon,
    retell_funciones,
    retell_colgar_ivr,
    retell_pantalla_llamadas,
    retell_dtmf_activo,
    retell_dtmf_timeout_ms,
    retell_dtmf_clave_terminacion,
    retell_dtmf_limite_digitos,
    retell_fin_silencio_ms,
    retell_duracion_maxima_ms,
    retell_duracion_anillo_ms,
  } = body as {
    nombre?: string;
    copyscript?: string;
    objetivo?: string | null;
    agente_tipo?: string;
    categoria?: string;
    publicada?: boolean;
    modo_agente?: string;
    retell_agent_id?: string | null;
    retell_voice_id?: string | null;
    retell_idioma?: string;
    retell_colgar_buzon?: boolean;
    retell_funciones?: FuncionRetell[];
    retell_colgar_ivr?: boolean;
    retell_pantalla_llamadas?: boolean;
    retell_dtmf_activo?: boolean;
    retell_dtmf_timeout_ms?: number;
    retell_dtmf_clave_terminacion?: string | null;
    retell_dtmf_limite_digitos?: number | null;
    retell_fin_silencio_ms?: number;
    retell_duracion_maxima_ms?: number;
    retell_duracion_anillo_ms?: number;
  };

  if (agente_tipo && !AGENTES_TIPO_DISPONIBLES.includes(agente_tipo as (typeof AGENTES_TIPO_DISPONIBLES)[number])) {
    return NextResponse.json({ error: "Ese tipo de agente todavía no está disponible (próximamente)" }, { status: 400 });
  }
  if (modo_agente !== undefined && !MODOS_AGENTE.includes(modo_agente as (typeof MODOS_AGENTE)[number])) {
    return NextResponse.json({ error: "Modo de agente inválido" }, { status: 400 });
  }
  if (modo_agente === "retell_propio" && retell_agent_id === undefined) {
    return NextResponse.json({ error: "Falta elegir el agente de Retell" }, { status: 400 });
  }

  const errorConfiguracionLlamada = validarConfiguracionLlamada(body);
  if (errorConfiguracionLlamada) return NextResponse.json({ error: errorConfiguracionLlamada }, { status: 400 });

  const admin = createAdminClient();

  if (publicada === true || retell_pantalla_llamadas === true) {
    const { data: actual } = await admin
      .from("plantillas_voz")
      .select("copyscript, objetivo")
      .eq("id", id)
      .eq("cuenta_id", auth.perfil.cuenta_id)
      .maybeSingle();

    if (publicada === true) {
      const copyscriptFinal = copyscript ?? actual?.copyscript ?? "";
      if (!copyscriptFinal.trim()) {
        return NextResponse.json({ error: "No se puede publicar una plantilla sin copyscript" }, { status: 400 });
      }
    }
    if (retell_pantalla_llamadas === true) {
      const objetivoFinal = objetivo ?? actual?.objetivo ?? "";
      if (!objetivoFinal.trim()) {
        return NextResponse.json({ error: "Falta el objetivo para activar la gestión de pantalla de llamadas" }, { status: 400 });
      }
    }
  }

  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (nombre !== undefined) cambios.nombre = nombre.trim();
  if (copyscript !== undefined) cambios.copyscript = copyscript;
  if (objetivo !== undefined) cambios.objetivo = objetivo?.trim() || null;
  if (agente_tipo !== undefined) cambios.agente_tipo = agente_tipo;
  if (categoria !== undefined) cambios.categoria = categoria;
  if (publicada !== undefined) cambios.publicada = publicada;
  if (modo_agente !== undefined) cambios.modo_agente = modo_agente;
  if (modo_agente === "retell_propio") cambios.retell_agent_id = retell_agent_id;
  if (retell_voice_id !== undefined) cambios.retell_voice_id = retell_voice_id;
  if (retell_idioma !== undefined) cambios.retell_idioma = retell_idioma;
  if (retell_colgar_buzon !== undefined) cambios.retell_colgar_buzon = retell_colgar_buzon;
  if (retell_funciones !== undefined) cambios.retell_funciones = retell_funciones;
  if (retell_colgar_ivr !== undefined) cambios.retell_colgar_ivr = retell_colgar_ivr;
  if (retell_pantalla_llamadas !== undefined) cambios.retell_pantalla_llamadas = retell_pantalla_llamadas;
  if (retell_dtmf_activo !== undefined) cambios.retell_dtmf_activo = retell_dtmf_activo;
  if (retell_dtmf_timeout_ms !== undefined) cambios.retell_dtmf_timeout_ms = retell_dtmf_timeout_ms;
  if (retell_dtmf_clave_terminacion !== undefined) cambios.retell_dtmf_clave_terminacion = retell_dtmf_clave_terminacion;
  if (retell_dtmf_limite_digitos !== undefined) cambios.retell_dtmf_limite_digitos = retell_dtmf_limite_digitos;
  if (retell_fin_silencio_ms !== undefined) cambios.retell_fin_silencio_ms = retell_fin_silencio_ms;
  if (retell_duracion_maxima_ms !== undefined) cambios.retell_duracion_maxima_ms = retell_duracion_maxima_ms;
  if (retell_duracion_anillo_ms !== undefined) cambios.retell_duracion_anillo_ms = retell_duracion_anillo_ms;

  const { data, error } = await admin
    .from("plantillas_voz")
    .update(cambios)
    .eq("id", id)
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Ya existe una plantilla de voz con ese nombre" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: publicada !== undefined ? (publicada ? "publicar_plantilla_voz" : "despublicar_plantilla_voz") : "edit_plantilla_voz",
    recursoTipo: "plantilla_voz",
    recursoId: id,
    request,
  });

  let avisoRetell: string | undefined;
  let plantillaFinal = data;

  if (data.modo_agente === "generado") {
    const sync = await sincronizarPlantillaVozConRetell(admin, auth.perfil.cuenta_id, data, `${origenPublico(request)}/api/webhooks/retell`);
    if (sync.ok) {
      const { data: actualizada } = await admin
        .from("plantillas_voz")
        .update({ retell_llm_id: sync.retellLlmId, retell_agent_id: sync.retellAgentId, retell_sincronizado_en: sync.sincronizadoEn })
        .eq("id", id)
        .select()
        .single();
      if (actualizada) plantillaFinal = actualizada;
    } else {
      avisoRetell = sync.error;
    }
  } else if (data.modo_agente === "retell_propio" && data.retell_agent_id) {
    const apiKey = await resolverApiKeyRetell(admin, auth.perfil.cuenta_id);
    if (apiKey) {
      const webhook = await asegurarWebhookAgente(apiKey, data.retell_agent_id, `${origenPublico(request)}/api/webhooks/retell`);
      if (!webhook.ok) avisoRetell = webhook.error;
    }
  }

  return NextResponse.json({ plantilla: plantillaFinal, avisoRetell });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_plantillas_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();
  await admin.from("plantillas_voz").delete().eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id);

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "delete_plantilla_voz",
    recursoTipo: "plantilla_voz",
    recursoId: id,
    request,
  });

  return NextResponse.json({ ok: true });
}
