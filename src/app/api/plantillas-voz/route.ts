import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

const AGENTES_TIPO = ["servicio", "citas", "venta", "cobranza", "legal"] as const;
const AGENTES_TIPO_DISPONIBLES = ["servicio"] as const;
const CATEGORIAS = ["legal", "medicos", "inmobiliario", "servicios", "cobranza", "ventas"] as const;

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
  const { nombre, copyscript, objetivo, agente_tipo, categoria, plantilla_base_clave } = body as {
    nombre?: string;
    copyscript?: string;
    objetivo?: string;
    agente_tipo?: string;
    categoria?: string;
    plantilla_base_clave?: string | null;
  };

  if (!nombre?.trim()) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });

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

  return NextResponse.json({ plantilla: data });
}
