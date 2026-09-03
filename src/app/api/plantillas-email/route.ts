import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

export async function GET() {
  const auth = await requirePermiso("manage_email");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("plantillas_email")
    .select("*")
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plantillas: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermiso("manage_email");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json();
  const { nombre, tipo, asunto, cuerpo_html, diseno_json } = body as {
    nombre?: string;
    tipo?: "confirmacion_cita" | "reagendamiento_cita" | "cancelacion_cita" | "campana";
    asunto?: string;
    cuerpo_html?: string;
    diseno_json?: unknown;
  };

  if (!nombre?.trim() || !tipo || !asunto?.trim() || !cuerpo_html?.trim()) {
    return NextResponse.json({ error: "Faltan nombre, tipo, asunto o cuerpo" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("plantillas_email")
    .insert({
      cuenta_id: auth.perfil.cuenta_id,
      nombre: nombre.trim(),
      tipo,
      asunto: asunto.trim(),
      cuerpo_html,
      diseno_json: diseno_json ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await registrarActividad({ cuentaId: auth.perfil.cuenta_id, perfilId: auth.user.id, accion: "create_plantilla_email", recursoTipo: "plantilla_email", recursoId: data.id, request });

  return NextResponse.json({ plantilla: data });
}
