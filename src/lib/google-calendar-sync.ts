import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerCambiosGoogle, type EventoGoogle } from "@/lib/google-calendar";
import { registrarActividad } from "@/lib/auditoria";

function horaEnZona(iso: string, zona: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
function fechaEnZona(iso: string, zona: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

// Reconcilia SOLO las citas que nosotros creamos (por google_event_id) --
// eventos ajenos del calendario del profesional (personales, de otras
// fuentes) se ignoran a propósito, nunca se importan como citas nuevas.
export async function sincronizarCitasDesdeGoogle(profesionalId: string) {
  const admin = createAdminClient();

  const { data: profesional } = await admin
    .from("profesionales")
    .select("id, cuenta_id, google_calendar_id, google_oauth_token_cifrado, google_oauth_expires_at, google_sync_token")
    .eq("id", profesionalId)
    .single();

  if (!profesional) return;

  const { eventos, nuevoSyncToken } = await obtenerCambiosGoogle({ profesional });

  const citasActualizadas: string[] = [];

  for (const evento of eventos as EventoGoogle[]) {
    const { data: cita } = await admin
      .from("citas_agendadas")
      .select("id, estado, fecha, hora_inicio, hora_fin")
      .eq("google_event_id", evento.id)
      .eq("profesional_id", profesionalId)
      .maybeSingle();

    if (!cita) continue;

    if (evento.status === "cancelled") {
      if (cita.estado !== "cancelada") {
        await admin.from("citas_agendadas").update({ estado: "cancelada", updated_at: new Date().toISOString() }).eq("id", cita.id);
        citasActualizadas.push(cita.id);
      }
      continue;
    }

    const inicio = evento.start?.dateTime;
    const fin = evento.end?.dateTime;
    if (!inicio || !fin) continue; // se pasó a evento de todo el día u otro formato -- se ignora

    const zona = evento.start?.timeZone || "America/Mexico_City";
    const fecha = fechaEnZona(inicio, zona);
    const horaInicio = horaEnZona(inicio, zona);
    const horaFin = horaEnZona(fin, zona);

    if (fecha !== cita.fecha || horaInicio !== cita.hora_inicio || horaFin !== cita.hora_fin) {
      await admin
        .from("citas_agendadas")
        .update({ fecha, hora_inicio: horaInicio, hora_fin: horaFin, estado: "confirmada", updated_at: new Date().toISOString() })
        .eq("id", cita.id);
      citasActualizadas.push(cita.id);
    }
  }

  if (nuevoSyncToken) {
    await admin.from("profesionales").update({ google_sync_token: nuevoSyncToken }).eq("id", profesionalId);
  }

  if (citasActualizadas.length > 0) {
    await registrarActividad({
      cuentaId: profesional.cuenta_id,
      perfilId: null,
      accion: "google_calendar_sync_inbound",
      recursoTipo: "cita",
      detalles: { profesional_id: profesionalId, citas: citasActualizadas },
    });
  }
}
