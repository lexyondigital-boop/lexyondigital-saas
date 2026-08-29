import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actualizarEventoGoogle, fechaHoraMexico } from "@/lib/google-calendar";
import { registrarActividad } from "@/lib/auditoria";

// Reagendar: cambia fecha/hora de una cita existente (mismo profesional).
// Si ya tiene evento en Google Calendar, se mueve ahí también.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const { fecha, hora_inicio, hora_fin } = await request.json();

  if (!fecha || !hora_inicio || !hora_fin) {
    return NextResponse.json({ error: "Faltan fecha, hora_inicio o hora_fin" }, { status: 400 });
  }

  const { data: cita } = await supabase.from("citas_agendadas").select("*, profesionales(*)").eq("id", id).single();
  if (!cita) return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });

  const { data: choque } = await supabase
    .from("citas_agendadas")
    .select("id")
    .eq("profesional_id", cita.profesional_id)
    .eq("fecha", fecha)
    .neq("id", id)
    .neq("estado", "cancelada")
    .lt("hora_inicio", hora_fin)
    .gt("hora_fin", hora_inicio)
    .maybeSingle();

  if (choque) {
    return NextResponse.json({ error: "El profesional ya tiene una cita en ese horario" }, { status: 409 });
  }

  if (cita.google_event_id && cita.profesionales) {
    await actualizarEventoGoogle({
      profesional: cita.profesionales,
      eventId: cita.google_event_id,
      inicio: fechaHoraMexico(fecha, hora_inicio),
      fin: fechaHoraMexico(fecha, hora_fin),
    });
  }

  const { error } = await supabase
    .from("citas_agendadas")
    .update({ fecha, hora_inicio, hora_fin, estado: "confirmada", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: perfil } = await supabase.from("perfiles").select("cuenta_id").eq("id", user.id).single();
  if (perfil) {
    await registrarActividad({
      cuentaId: perfil.cuenta_id,
      perfilId: user.id,
      accion: "reschedule_appointment",
      recursoTipo: "cita",
      recursoId: id,
      detalles: { fecha, hora_inicio, hora_fin },
      request,
    });
  }

  return NextResponse.json({ ok: true });
}
