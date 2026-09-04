import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

const AGENTES_TIPO_DISPONIBLES = ["servicio"] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_plantillas_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json();
  const { nombre, copyscript, objetivo, agente_tipo, categoria, publicada } = body as {
    nombre?: string;
    copyscript?: string;
    objetivo?: string | null;
    agente_tipo?: string;
    categoria?: string;
    publicada?: boolean;
  };

  if (agente_tipo && !AGENTES_TIPO_DISPONIBLES.includes(agente_tipo as (typeof AGENTES_TIPO_DISPONIBLES)[number])) {
    return NextResponse.json({ error: "Ese tipo de agente todavía no está disponible (próximamente)" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (publicada === true) {
    const { data: actual } = await admin
      .from("plantillas_voz")
      .select("copyscript")
      .eq("id", id)
      .eq("cuenta_id", auth.perfil.cuenta_id)
      .maybeSingle();
    const copyscriptFinal = copyscript ?? actual?.copyscript ?? "";
    if (!copyscriptFinal.trim()) {
      return NextResponse.json({ error: "No se puede publicar una plantilla sin copyscript" }, { status: 400 });
    }
  }

  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (nombre !== undefined) cambios.nombre = nombre.trim();
  if (copyscript !== undefined) cambios.copyscript = copyscript;
  if (objetivo !== undefined) cambios.objetivo = objetivo?.trim() || null;
  if (agente_tipo !== undefined) cambios.agente_tipo = agente_tipo;
  if (categoria !== undefined) cambios.categoria = categoria;
  if (publicada !== undefined) cambios.publicada = publicada;

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

  return NextResponse.json({ plantilla: data });
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
