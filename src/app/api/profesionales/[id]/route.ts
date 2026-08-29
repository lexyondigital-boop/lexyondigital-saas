import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminCuenta } from "@/lib/require-admin-cuenta";
import { registrarActividad } from "@/lib/auditoria";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const { data, error } = await supabase.from("profesionales").select("*").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });

  const { google_oauth_token_cifrado, ...seguro } = data;
  void google_oauth_token_cifrado;
  return NextResponse.json({ profesional: seguro });
}

const DIAS_VALIDOS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminCuenta();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json();
  const admin = createAdminClient();

  const { data: actual } = await admin
    .from("profesionales")
    .select("id, cuenta_id, nombre")
    .eq("id", id)
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .single();

  if (!actual) return NextResponse.json({ error: "Profesional no encontrado en tu cuenta" }, { status: 404 });

  const cambios: Record<string, unknown> = {};
  if (typeof body.especialidad === "string") cambios.especialidad = body.especialidad.trim();
  if (typeof body.color_agenda === "string") cambios.color_agenda = body.color_agenda;
  if (typeof body.telefono === "string") cambios.telefono = body.telefono.trim() || null;
  if (typeof body.biografia === "string") cambios.biografia = body.biografia.trim() || null;
  if (typeof body.foto_url === "string") cambios.foto_url = body.foto_url.trim() || null;
  if (typeof body.horario_inicio === "string") cambios.horario_inicio = body.horario_inicio;
  if (typeof body.horario_fin === "string") cambios.horario_fin = body.horario_fin;
  if (Array.isArray(body.dias_disponibles) && body.dias_disponibles.every((d: string) => DIAS_VALIDOS.includes(d))) {
    cambios.dias_disponibles = body.dias_disponibles;
  }
  if (typeof body.duracion_cita_minutos === "number") cambios.duracion_cita_minutos = body.duracion_cita_minutos;
  if (body.estado === "activo" || body.estado === "inactivo") cambios.estado = body.estado;

  if (Object.keys(cambios).length === 0) return NextResponse.json({ ok: true });

  cambios.updated_at = new Date().toISOString();
  const { error } = await admin.from("profesionales").update(cambios).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "edit_professional",
    recursoTipo: "profesional",
    recursoId: id,
    detalles: cambios,
    request,
  });

  return NextResponse.json({ ok: true });
}
