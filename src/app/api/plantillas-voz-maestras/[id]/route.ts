import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { validarConfiguracionLlamada } from "@/lib/plantillas-voz";
import type { FuncionRetell } from "@/lib/retell";

const AGENTES_TIPO = ["servicio", "citas", "venta", "cobranza", "legal"] as const;
const STATUS = ["activa", "deprecada"] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json();
  const {
    nombre,
    descripcion,
    agente_tipo,
    categoria,
    copyscript,
    objetivo,
    status,
    retell_voice_id,
    retell_idioma,
    retell_colgar_buzon,
    retell_colgar_ivr,
    retell_pantalla_llamadas,
    retell_dtmf_activo,
    retell_dtmf_timeout_ms,
    retell_dtmf_clave_terminacion,
    retell_dtmf_limite_digitos,
    retell_fin_silencio_ms,
    retell_duracion_maxima_ms,
    retell_duracion_anillo_ms,
    retell_funciones,
    retell_numeros_disponibles,
  } = body as {
    nombre?: string;
    descripcion?: string | null;
    agente_tipo?: string;
    categoria?: string;
    copyscript?: string;
    objetivo?: string | null;
    status?: string;
    retell_voice_id?: string | null;
    retell_idioma?: string;
    retell_colgar_buzon?: boolean;
    retell_colgar_ivr?: boolean;
    retell_pantalla_llamadas?: boolean;
    retell_dtmf_activo?: boolean;
    retell_dtmf_timeout_ms?: number;
    retell_dtmf_clave_terminacion?: string | null;
    retell_dtmf_limite_digitos?: number | null;
    retell_fin_silencio_ms?: number;
    retell_duracion_maxima_ms?: number;
    retell_duracion_anillo_ms?: number;
    retell_funciones?: FuncionRetell[];
    retell_numeros_disponibles?: string[];
  };

  if (agente_tipo && !AGENTES_TIPO.includes(agente_tipo as (typeof AGENTES_TIPO)[number])) {
    return NextResponse.json({ error: "Tipo de agente inválido" }, { status: 400 });
  }
  if (status !== undefined && !STATUS.includes(status as (typeof STATUS)[number])) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  const errorConfiguracionLlamada = validarConfiguracionLlamada(body);
  if (errorConfiguracionLlamada) return NextResponse.json({ error: errorConfiguracionLlamada }, { status: 400 });

  const admin = createAdminClient();

  if (retell_pantalla_llamadas === true) {
    const { data: actual } = await admin.from("plantillas_voz_maestras").select("objetivo").eq("id", id).maybeSingle();
    const objetivoFinal = objetivo ?? actual?.objetivo ?? "";
    if (!objetivoFinal.trim()) {
      return NextResponse.json({ error: "Falta el objetivo para activar la gestión de pantalla de llamadas" }, { status: 400 });
    }
  }

  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (nombre !== undefined) cambios.nombre = nombre.trim();
  if (descripcion !== undefined) cambios.descripcion = descripcion?.trim() || null;
  if (agente_tipo !== undefined) cambios.agente_tipo = agente_tipo;
  if (categoria !== undefined) cambios.categoria = categoria;
  if (copyscript !== undefined) cambios.copyscript = copyscript;
  if (objetivo !== undefined) cambios.objetivo = objetivo?.trim() || null;
  if (status !== undefined) cambios.status = status;
  if (retell_voice_id !== undefined) cambios.retell_voice_id = retell_voice_id;
  if (retell_idioma !== undefined) cambios.retell_idioma = retell_idioma;
  if (retell_colgar_buzon !== undefined) cambios.retell_colgar_buzon = retell_colgar_buzon;
  if (retell_colgar_ivr !== undefined) cambios.retell_colgar_ivr = retell_colgar_ivr;
  if (retell_pantalla_llamadas !== undefined) cambios.retell_pantalla_llamadas = retell_pantalla_llamadas;
  if (retell_dtmf_activo !== undefined) cambios.retell_dtmf_activo = retell_dtmf_activo;
  if (retell_dtmf_timeout_ms !== undefined) cambios.retell_dtmf_timeout_ms = retell_dtmf_timeout_ms;
  if (retell_dtmf_clave_terminacion !== undefined) cambios.retell_dtmf_clave_terminacion = retell_dtmf_clave_terminacion;
  if (retell_dtmf_limite_digitos !== undefined) cambios.retell_dtmf_limite_digitos = retell_dtmf_limite_digitos;
  if (retell_fin_silencio_ms !== undefined) cambios.retell_fin_silencio_ms = retell_fin_silencio_ms;
  if (retell_duracion_maxima_ms !== undefined) cambios.retell_duracion_maxima_ms = retell_duracion_maxima_ms;
  if (retell_duracion_anillo_ms !== undefined) cambios.retell_duracion_anillo_ms = retell_duracion_anillo_ms;
  if (retell_funciones !== undefined) cambios.retell_funciones = retell_funciones;
  if (retell_numeros_disponibles !== undefined) cambios.retell_numeros_disponibles = retell_numeros_disponibles;

  const { data, error } = await admin.from("plantillas_voz_maestras").update(cambios).eq("id", id).select().single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Ya existe una plantilla maestra con ese nombre" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ plantilla: data });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from("plantillas_voz_maestras").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
