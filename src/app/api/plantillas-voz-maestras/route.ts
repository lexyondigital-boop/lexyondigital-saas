import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { validarConfiguracionLlamada } from "@/lib/plantillas-voz";
import type { FuncionRetell } from "@/lib/retell";

const AGENTES_TIPO = ["servicio", "citas", "venta", "cobranza", "legal"] as const;
const CATEGORIAS = ["legal", "medicos", "inmobiliario", "servicios", "cobranza", "ventas"] as const;

// Plantillas maestras de la cuenta master -- blueprints de datos que las
// sub-cuentas usan como punto de partida al crear un agente (Fase D). No
// tienen agente de Retell propio: Retell no permite duplicar un agente entre
// cuentas/API keys distintas, y una sub-cuenta puede estar en modo "master" o
// "propia".
export async function GET() {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data, error } = await admin.from("plantillas_voz_maestras").select("*").order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plantillas: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json();
  const {
    nombre,
    descripcion,
    agente_tipo,
    categoria,
    copyscript,
    objetivo,
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
  } = body as {
    nombre?: string;
    descripcion?: string | null;
    agente_tipo?: string;
    categoria?: string;
    copyscript?: string;
    objetivo?: string | null;
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
  };

  if (!nombre?.trim()) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });

  const agenteTipoFinal = agente_tipo ?? "servicio";
  if (!AGENTES_TIPO.includes(agenteTipoFinal as (typeof AGENTES_TIPO)[number])) {
    return NextResponse.json({ error: "Tipo de agente inválido" }, { status: 400 });
  }

  const categoriaFinal = categoria ?? "servicios";
  if (!CATEGORIAS.includes(categoriaFinal as (typeof CATEGORIAS)[number])) {
    return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
  }

  if (retell_pantalla_llamadas && !objetivo?.trim()) {
    return NextResponse.json({ error: "Falta el objetivo para activar la gestión de pantalla de llamadas" }, { status: 400 });
  }

  const errorConfiguracionLlamada = validarConfiguracionLlamada(body);
  if (errorConfiguracionLlamada) return NextResponse.json({ error: errorConfiguracionLlamada }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("plantillas_voz_maestras")
    .insert({
      nombre: nombre.trim(),
      descripcion: descripcion?.trim() || null,
      agente_tipo: agenteTipoFinal,
      categoria: categoriaFinal,
      copyscript: copyscript?.trim() ?? "",
      objetivo: objetivo?.trim() || null,
      retell_voice_id: retell_voice_id ?? null,
      retell_idioma: retell_idioma ?? "es-419",
      retell_colgar_buzon: retell_colgar_buzon ?? true,
      ...(retell_colgar_ivr !== undefined ? { retell_colgar_ivr } : {}),
      ...(retell_pantalla_llamadas !== undefined ? { retell_pantalla_llamadas } : {}),
      ...(retell_dtmf_activo !== undefined ? { retell_dtmf_activo } : {}),
      ...(retell_dtmf_timeout_ms !== undefined ? { retell_dtmf_timeout_ms } : {}),
      ...(retell_dtmf_clave_terminacion !== undefined ? { retell_dtmf_clave_terminacion } : {}),
      ...(retell_dtmf_limite_digitos !== undefined ? { retell_dtmf_limite_digitos } : {}),
      ...(retell_fin_silencio_ms !== undefined ? { retell_fin_silencio_ms } : {}),
      ...(retell_duracion_maxima_ms !== undefined ? { retell_duracion_maxima_ms } : {}),
      ...(retell_duracion_anillo_ms !== undefined ? { retell_duracion_anillo_ms } : {}),
      ...(retell_funciones !== undefined ? { retell_funciones } : {}),
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Ya existe una plantilla maestra con ese nombre" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ plantilla: data });
}
