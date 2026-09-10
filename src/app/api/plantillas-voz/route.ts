import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";
import {
  sincronizarPlantillaVozConRetell,
  resolverApiKeyRetell,
  asegurarWebhookAgente,
  resolverCamposACapturar,
  type FuncionRetell,
} from "@/lib/retell";
import { origenPublico } from "@/lib/origen-publico";
import { validarConfiguracionLlamada, validarFuncionTransferCall } from "@/lib/plantillas-voz";

const AGENTES_TIPO = ["servicio", "citas", "venta", "cobranza", "legal"] as const;
const CATEGORIAS = ["legal", "medicos", "inmobiliario", "servicios", "cobranza", "ventas"] as const;
const MODOS_AGENTE = ["generado", "retell_propio"] as const;

export async function GET(request: NextRequest) {
  const auth = await requirePermiso("manage_plantillas_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const busqueda = searchParams.get("q")?.trim();
  const agenteTipo = searchParams.get("agente_tipo");
  const categoria = searchParams.get("categoria");
  const publicada = searchParams.get("publicada");

  const admin = createAdminClient();
  let query = admin.from("plantillas_voz").select("*").eq("cuenta_id", auth.perfil.cuenta_id).order("created_at", { ascending: false });

  if (busqueda) query = query.ilike("nombre", `%${busqueda}%`);
  if (agenteTipo) query = query.eq("agente_tipo", agenteTipo);
  if (categoria) query = query.eq("categoria", categoria);
  if (publicada === "true") query = query.eq("publicada", true);
  if (publicada === "false") query = query.eq("publicada", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plantillas: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermiso("manage_plantillas_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json();
  const {
    nombre,
    copyscript,
    objetivo,
    agente_tipo,
    categoria,
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
    retell_habla_primero,
    retell_mensaje_bienvenida,
    retell_variables_a_capturar,
  } = body as {
    nombre?: string;
    copyscript?: string;
    objetivo?: string;
    agente_tipo?: string;
    categoria?: string;
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
    retell_habla_primero?: boolean;
    retell_mensaje_bienvenida?: string | null;
    retell_variables_a_capturar?: string[];
  };

  if (!nombre?.trim()) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });

  const errorConfiguracionLlamada = validarConfiguracionLlamada(body);
  if (errorConfiguracionLlamada) return NextResponse.json({ error: errorConfiguracionLlamada }, { status: 400 });

  if (retell_habla_primero && !retell_mensaje_bienvenida?.trim()) {
    return NextResponse.json({ error: "Falta el mensaje de bienvenida para que la IA hable primero" }, { status: 400 });
  }

  for (const f of retell_funciones ?? []) {
    const errorFuncion = validarFuncionTransferCall(f);
    if (errorFuncion) return NextResponse.json({ error: errorFuncion }, { status: 400 });
  }

  if (retell_pantalla_llamadas && !objetivo?.trim()) {
    return NextResponse.json({ error: "Falta el objetivo para activar la gestión de pantalla de llamadas" }, { status: 400 });
  }

  const modoAgenteFinal = modo_agente ?? "generado";
  if (!MODOS_AGENTE.includes(modoAgenteFinal as (typeof MODOS_AGENTE)[number])) {
    return NextResponse.json({ error: "Modo de agente inválido" }, { status: 400 });
  }
  if (modoAgenteFinal === "retell_propio" && !retell_agent_id) {
    return NextResponse.json({ error: "Falta elegir el agente de Retell" }, { status: 400 });
  }

  const agenteTipoFinal = agente_tipo ?? "servicio";
  if (!AGENTES_TIPO.includes(agenteTipoFinal as (typeof AGENTES_TIPO)[number])) {
    return NextResponse.json({ error: "Tipo de agente inválido" }, { status: 400 });
  }

  const categoriaFinal = categoria ?? "servicios";
  if (!CATEGORIAS.includes(categoriaFinal as (typeof CATEGORIAS)[number])) {
    return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
  }

  const admin = createAdminClient();

  const clavesACapturar = retell_variables_a_capturar ?? [];
  const { campos: camposACapturar, invalidas } = await resolverCamposACapturar(admin, auth.perfil.cuenta_id, clavesACapturar);
  if (invalidas.length > 0) {
    return NextResponse.json({ error: `Variables inválidas: ${invalidas.join(", ")}` }, { status: 400 });
  }

  // Máximo un agente de voz por sub-cuenta por ahora -- editar o eliminar el
  // existente antes de crear otro.
  const { count: agentesExistentes } = await admin
    .from("plantillas_voz")
    .select("id", { count: "exact", head: true })
    .eq("cuenta_id", auth.perfil.cuenta_id);
  if ((agentesExistentes ?? 0) > 0) {
    return NextResponse.json(
      { error: "Ya existe un agente de voz para esta cuenta -- edítalo o elimínalo antes de crear uno nuevo" },
      { status: 409 },
    );
  }

  // Necesita un número saliente de Retell configurado (propio o el incluido
  // de lexyondigital, ambos se configuran igual en Configuración →
  // Integraciones) -- sin eso no hay de dónde sacar el número para llamar.
  if (modoAgenteFinal === "generado") {
    const { data: cuentaRetell } = await admin
      .from("cuentas_retell")
      .select("numero_saliente")
      .eq("cuenta_id", auth.perfil.cuenta_id)
      .eq("activo", true)
      .maybeSingle();

    if (!cuentaRetell?.numero_saliente) {
      return NextResponse.json(
        { error: "Falta configurar el número saliente de Retell en Configuración → Integraciones antes de crear tu agente" },
        { status: 409 },
      );
    }
  }

  const { data, error } = await admin
    .from("plantillas_voz")
    .insert({
      cuenta_id: auth.perfil.cuenta_id,
      nombre: nombre.trim(),
      copyscript: copyscript?.trim() ?? "",
      objetivo: objetivo?.trim() || null,
      agente_tipo: agenteTipoFinal,
      categoria: categoriaFinal,
      modo_agente: modoAgenteFinal,
      retell_agent_id: modoAgenteFinal === "retell_propio" ? retell_agent_id : null,
      retell_voice_id: modoAgenteFinal === "generado" ? (retell_voice_id ?? null) : null,
      retell_idioma: retell_idioma ?? "es-419",
      retell_colgar_buzon: retell_colgar_buzon ?? true,
      ...(retell_funciones !== undefined ? { retell_funciones } : {}),
      ...(retell_colgar_ivr !== undefined ? { retell_colgar_ivr } : {}),
      ...(retell_pantalla_llamadas !== undefined ? { retell_pantalla_llamadas } : {}),
      ...(retell_dtmf_activo !== undefined ? { retell_dtmf_activo } : {}),
      ...(retell_dtmf_timeout_ms !== undefined ? { retell_dtmf_timeout_ms } : {}),
      ...(retell_dtmf_clave_terminacion !== undefined ? { retell_dtmf_clave_terminacion } : {}),
      ...(retell_dtmf_limite_digitos !== undefined ? { retell_dtmf_limite_digitos } : {}),
      ...(retell_fin_silencio_ms !== undefined ? { retell_fin_silencio_ms } : {}),
      ...(retell_duracion_maxima_ms !== undefined ? { retell_duracion_maxima_ms } : {}),
      ...(retell_duracion_anillo_ms !== undefined ? { retell_duracion_anillo_ms } : {}),
      retell_habla_primero: retell_habla_primero ?? false,
      retell_mensaje_bienvenida: retell_mensaje_bienvenida?.trim() || null,
      retell_variables_a_capturar: clavesACapturar,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Ya existe una plantilla de voz con ese nombre" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "create_plantilla_voz",
    recursoTipo: "plantilla_voz",
    recursoId: data.id,
    request,
  });

  let avisoRetell: string | undefined;
  let plantillaFinal = data;

  if (modoAgenteFinal === "generado") {
    const sync = await sincronizarPlantillaVozConRetell(
      admin,
      auth.perfil.cuenta_id,
      data,
      `${origenPublico(request)}/api/webhooks/retell`,
      camposACapturar,
    );
    if (sync.ok) {
      const { data: actualizada } = await admin
        .from("plantillas_voz")
        .update({ retell_llm_id: sync.retellLlmId, retell_agent_id: sync.retellAgentId, retell_sincronizado_en: sync.sincronizadoEn })
        .eq("id", data.id)
        .select()
        .single();
      if (actualizada) plantillaFinal = actualizada;
    } else {
      avisoRetell = sync.error;
    }
  } else if (modoAgenteFinal === "retell_propio" && retell_agent_id) {
    const apiKey = await resolverApiKeyRetell(admin, auth.perfil.cuenta_id);
    if (apiKey) {
      const webhook = await asegurarWebhookAgente(apiKey, retell_agent_id, `${origenPublico(request)}/api/webhooks/retell`);
      if (!webhook.ok) avisoRetell = webhook.error;
    }
  }

  return NextResponse.json({ plantilla: plantillaFinal, avisoRetell });
}
