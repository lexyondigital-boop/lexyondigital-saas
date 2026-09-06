import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";
import { sincronizarPlantillaVozConRetell, type FuncionRetell } from "@/lib/retell";
import { origenPublico } from "@/lib/origen-publico";

const AGENTES_TIPO = ["servicio", "citas", "venta", "cobranza", "legal"] as const;
const AGENTES_TIPO_DISPONIBLES = ["servicio"] as const;
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
    plantilla_base_clave,
    modo_agente,
    retell_agent_id,
    retell_voice_id,
    retell_idioma,
    retell_colgar_buzon,
    retell_funciones,
  } = body as {
    nombre?: string;
    copyscript?: string;
    objetivo?: string;
    agente_tipo?: string;
    categoria?: string;
    plantilla_base_clave?: string | null;
    modo_agente?: string;
    retell_agent_id?: string | null;
    retell_voice_id?: string | null;
    retell_idioma?: string;
    retell_colgar_buzon?: boolean;
    retell_funciones?: FuncionRetell[];
  };

  if (!nombre?.trim()) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });

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
  if (!AGENTES_TIPO_DISPONIBLES.includes(agenteTipoFinal as (typeof AGENTES_TIPO_DISPONIBLES)[number])) {
    return NextResponse.json({ error: "Ese tipo de agente todavía no está disponible (próximamente)" }, { status: 400 });
  }

  const categoriaFinal = categoria ?? "servicios";
  if (!CATEGORIAS.includes(categoriaFinal as (typeof CATEGORIAS)[number])) {
    return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("plantillas_voz")
    .insert({
      cuenta_id: auth.perfil.cuenta_id,
      nombre: nombre.trim(),
      copyscript: copyscript?.trim() ?? "",
      objetivo: objetivo?.trim() || null,
      agente_tipo: agenteTipoFinal,
      categoria: categoriaFinal,
      plantilla_base_clave: plantilla_base_clave ?? null,
      modo_agente: modoAgenteFinal,
      retell_agent_id: modoAgenteFinal === "retell_propio" ? retell_agent_id : null,
      retell_voice_id: modoAgenteFinal === "generado" ? (retell_voice_id ?? null) : null,
      retell_idioma: retell_idioma ?? "es-419",
      retell_colgar_buzon: retell_colgar_buzon ?? true,
      ...(retell_funciones !== undefined ? { retell_funciones } : {}),
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
    const sync = await sincronizarPlantillaVozConRetell(admin, auth.perfil.cuenta_id, data, `${origenPublico(request)}/api/webhooks/retell`);
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
  }

  return NextResponse.json({ plantilla: plantillaFinal, avisoRetell });
}
