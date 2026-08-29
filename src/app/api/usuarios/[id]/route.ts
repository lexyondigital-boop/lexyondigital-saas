import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminCuenta } from "@/lib/require-admin-cuenta";
import { registrarActividad, registrarCambioPermiso } from "@/lib/auditoria";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminCuenta();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json();
  const admin = createAdminClient();

  const { data: perfilActual } = await admin
    .from("perfiles")
    .select("*")
    .eq("id", id)
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .single();

  if (!perfilActual) {
    return NextResponse.json({ error: "Usuario no encontrado en tu cuenta" }, { status: 404 });
  }

  const cambios: Record<string, unknown> = {};
  if (typeof body.nombre === "string") cambios.nombre = body.nombre.trim() || null;
  if (typeof body.telefono === "string") cambios.telefono = body.telefono.trim() || null;
  if (body.rol === "admin" || body.rol === "agente") cambios.rol = body.rol;
  if ("equipo_id" in body) cambios.equipo_id = body.equipo_id || null;
  if (typeof body.activo === "boolean") cambios.activo = body.activo;

  if (typeof body.es_profesional === "boolean" && body.es_profesional !== perfilActual.es_profesional) {
    if (body.es_profesional) {
      if (!body.profesional?.especialidad?.trim()) {
        return NextResponse.json({ error: "Falta la especialidad del profesionista" }, { status: 400 });
      }
      const { data: nuevoProfesional, error: profesionalError } = await admin
        .from("profesionales")
        .insert({
          cuenta_id: auth.perfil.cuenta_id,
          perfil_id: id,
          nombre: (typeof cambios.nombre === "string" ? cambios.nombre : perfilActual.nombre) ?? "",
          especialidad: body.profesional.especialidad.trim(),
          email: body.profesional.email_google?.trim() || null,
          color_agenda: body.profesional.color_agenda || "#6b2fa0",
        })
        .select("id")
        .single();
      if (profesionalError) return NextResponse.json({ error: profesionalError.message }, { status: 500 });
      cambios.es_profesional = true;
      cambios.profesional_id = nuevoProfesional.id;
    } else if (perfilActual.profesional_id) {
      await admin.from("profesionales").delete().eq("id", perfilActual.profesional_id);
      cambios.es_profesional = false;
      cambios.profesional_id = null;
    }
  } else if (body.es_profesional && perfilActual.profesional_id && body.profesional) {
    const camposProfesional: Record<string, unknown> = {};
    if (typeof body.profesional.especialidad === "string") camposProfesional.especialidad = body.profesional.especialidad.trim();
    if (typeof body.profesional.color_agenda === "string") camposProfesional.color_agenda = body.profesional.color_agenda;
    if (typeof body.profesional.email_google === "string") camposProfesional.email = body.profesional.email_google.trim() || null;
    if (typeof body.profesional.telefono === "string") camposProfesional.telefono = body.profesional.telefono.trim() || null;
    if (typeof body.profesional.biografia === "string") camposProfesional.biografia = body.profesional.biografia.trim() || null;
    if (typeof body.profesional.horario_inicio === "string") camposProfesional.horario_inicio = body.profesional.horario_inicio;
    if (typeof body.profesional.horario_fin === "string") camposProfesional.horario_fin = body.profesional.horario_fin;
    if (Array.isArray(body.profesional.dias_disponibles)) camposProfesional.dias_disponibles = body.profesional.dias_disponibles;
    if (typeof body.profesional.duracion_cita_minutos === "number") camposProfesional.duracion_cita_minutos = body.profesional.duracion_cita_minutos;
    if (Object.keys(camposProfesional).length > 0) {
      camposProfesional.updated_at = new Date().toISOString();
      const { error } = await admin.from("profesionales").update(camposProfesional).eq("id", perfilActual.profesional_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (Object.keys(cambios).length > 0) {
    const { error } = await admin.from("perfiles").update(cambios).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (typeof cambios.rol === "string" && cambios.rol !== perfilActual.rol) {
    await registrarCambioPermiso({
      cuentaId: auth.perfil.cuenta_id,
      perfilId: id,
      cambiadoPor: auth.user.id,
      permisoClave: "rol",
      valorAnterior: null,
      valorNuevo: null,
      tipoCambio: "cambio_rol",
      razon: `${perfilActual.rol} → ${cambios.rol}${body.razon ? " — " + body.razon : ""}`,
    });
  }

  if (Array.isArray(body.permisos)) {
    for (const p of body.permisos as { clave: string; concedido: boolean }[]) {
      const { data: existente } = await admin
        .from("perfil_permisos")
        .select("concedido")
        .eq("perfil_id", id)
        .eq("permiso_clave", p.clave)
        .maybeSingle();

      const anterior = existente ? existente.concedido : null;
      if (anterior === p.concedido) continue;

      await admin
        .from("perfil_permisos")
        .upsert(
          { cuenta_id: auth.perfil.cuenta_id, perfil_id: id, permiso_clave: p.clave, concedido: p.concedido },
          { onConflict: "perfil_id,permiso_clave" },
        );

      await registrarCambioPermiso({
        cuentaId: auth.perfil.cuenta_id,
        perfilId: id,
        cambiadoPor: auth.user.id,
        permisoClave: p.clave,
        valorAnterior: anterior,
        valorNuevo: p.concedido,
        tipoCambio: p.concedido ? "concedido" : "revocado",
        razon: body.razon,
      });
    }
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: cambios.activo === false ? "deactivate_user" : "edit_user",
    recursoTipo: "user",
    recursoId: id,
    detalles: cambios,
    request,
  });

  return NextResponse.json({ ok: true });
}
