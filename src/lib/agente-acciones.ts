import { createAdminClient } from "@/lib/supabase/admin";
import { crearEventoGoogle, actualizarEventoGoogle, eliminarEventoGoogle, obtenerOcupacionGoogle, fechaHoraMexico } from "@/lib/google-calendar";
import { calcularSlotsDisponibles } from "@/lib/disponibilidad";
import { registrarActividad } from "@/lib/auditoria";
import { construirBloqueAgenda } from "@/lib/agente-prompt-agenda";
import type { Herramienta } from "@/lib/ia";

type AdminClient = ReturnType<typeof createAdminClient>;

// profesionalesPermitidos null = todos los activos de la cuenta (compatible
// con cuentas que nunca configuraron el selector); un arreglo (incluido
// vacío) = restricción explícita elegida en la pantalla de Agente IA. Se
// aplica tanto al armar el prompt como -- más importante -- adentro de cada
// herramienta, para que el modelo no pueda tocar un profesional fuera de su
// alcance así se lo invente en el input de una tool call.
type ContextoAgente = { cuentaId: string; contactoId: string; conversacionId: string; profesionalesPermitidos: string[] | null };

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const ZONA_HORARIA = "America/Mexico_City";

// Herramientas de solo lectura: seguras en cualquier modalidad del agente
// (incluida "sugestivo", donde un humano todavía revisa lo que se manda).
export const HERRAMIENTAS_CONSULTA: Herramienta[] = [
  {
    nombre: "consultar_disponibilidad",
    descripcion:
      "Consulta los horarios libres de un profesional en una fecha específica (combina horario laboral, bloqueos, citas ya agendadas y su Google Calendar si está conectado). Úsala siempre antes de ofrecer un horario -- nunca inventes horarios.",
    parametros: {
      type: "object",
      properties: {
        profesional_id: { type: "string", description: "id exacto del profesional, tomado de la lista de PROFESIONALES DISPONIBLES del contexto" },
        fecha: { type: "string", description: "Fecha a consultar, formato YYYY-MM-DD" },
      },
      required: ["profesional_id", "fecha"],
    },
  },
  {
    nombre: "listar_citas_contacto",
    descripcion: "Lista las citas futuras (no canceladas) que ya tiene agendadas este mismo paciente. Úsala antes de reagendar o cancelar para obtener el cita_id correcto -- nunca lo inventes ni lo deduzcas.",
    parametros: { type: "object", properties: {} },
  },
];

// Herramientas que modifican datos reales -- solo se ofrecen cuando el
// agente responde de forma automática (ver agente-ia-runtime.ts). En modo
// "sugestivo" un humano aprueba el texto antes de mandarlo, así que no tiene
// sentido dejar que el modelo agende/cancele citas reales en ese modo.
export const HERRAMIENTAS_ACCION: Herramienta[] = [
  {
    nombre: "crear_cita",
    descripcion: "Agenda una cita nueva para este paciente. Antes de llamarla, valida el horario con consultar_disponibilidad y confírmalo con el paciente en el chat.",
    parametros: {
      type: "object",
      properties: {
        profesional_id: { type: "string", description: "id exacto del profesional" },
        fecha: { type: "string", description: "YYYY-MM-DD" },
        hora_inicio: { type: "string", description: "HH:MM en formato 24h" },
        hora_fin: { type: "string", description: "HH:MM en formato 24h" },
        tipo_cita: { type: "string", description: "Motivo breve de la consulta (opcional)" },
        notas: { type: "string", description: "Notas adicionales para el profesional (opcional)" },
      },
      required: ["profesional_id", "fecha", "hora_inicio", "hora_fin"],
    },
  },
  {
    nombre: "reagendar_cita",
    descripcion: "Cambia la fecha y/o el horario de una cita ya existente de este paciente. Usa listar_citas_contacto primero para obtener el cita_id correcto, y consultar_disponibilidad para validar el nuevo horario.",
    parametros: {
      type: "object",
      properties: {
        cita_id: { type: "string", description: "id de la cita a mover, obtenido de listar_citas_contacto" },
        fecha: { type: "string", description: "YYYY-MM-DD" },
        hora_inicio: { type: "string", description: "HH:MM en formato 24h" },
        hora_fin: { type: "string", description: "HH:MM en formato 24h" },
      },
      required: ["cita_id", "fecha", "hora_inicio", "hora_fin"],
    },
  },
  {
    nombre: "cancelar_cita",
    descripcion: "Cancela una cita existente de este paciente. Usa listar_citas_contacto primero para obtener el cita_id correcto. Confirma con el paciente antes de cancelar.",
    parametros: {
      type: "object",
      properties: { cita_id: { type: "string", description: "id de la cita a cancelar" } },
      required: ["cita_id"],
    },
  },
];

// Arma el ejecutor que se le pasa a generarRespuestaIA -- resuelve cada
// llamada de herramienta contra las tablas reales, siempre acotado a la
// cuenta y al contacto de la conversación en curso (un paciente nunca puede
// tocar, ver ni cancelar la cita de otro).
export function crearEjecutorHerramientas(contexto: ContextoAgente): (nombre: string, input: Record<string, unknown>) => Promise<unknown> {
  const admin = createAdminClient();

  return async function ejecutar(nombre: string, input: Record<string, unknown>): Promise<unknown> {
    switch (nombre) {
      case "consultar_disponibilidad":
        return consultarDisponibilidad(admin, contexto, input as { profesional_id?: string; fecha?: string });
      case "listar_citas_contacto":
        return listarCitasContacto(admin, contexto);
      case "crear_cita":
        return crearCita(admin, contexto, input as ParametrosCrearCita);
      case "reagendar_cita":
        return reagendarCita(admin, contexto, input as ParametrosReagendarCita);
      case "cancelar_cita":
        return cancelarCita(admin, contexto, input as { cita_id?: string });
      default:
        return { error: `Herramienta desconocida: ${nombre}` };
    }
  };
}

// Lista compacta para el prompt del sistema -- así el modelo conoce los ids
// reales sin necesidad de gastar un turno de herramienta solo para pedirlos.
// Respeta el selector de profesionales configurado en Agente IA.
export async function listarProfesionalesParaPrompt(cuentaId: string, profesionalesIds: string[] | null): Promise<string | null> {
  if (profesionalesIds !== null && profesionalesIds.length === 0) return null;

  const admin = createAdminClient();
  let query = admin
    .from("profesionales")
    .select("id, nombre, especialidad, horario_inicio, horario_fin, dias_disponibles, duracion_cita_minutos")
    .eq("cuenta_id", cuentaId)
    .eq("estado", "activo");

  if (profesionalesIds !== null) query = query.in("id", profesionalesIds);

  const { data } = await query;
  return construirBloqueAgenda(data ?? []);
}

async function obtenerProfesionalDeCuenta(admin: AdminClient, contexto: ContextoAgente, profesionalId: string) {
  if (contexto.profesionalesPermitidos !== null && !contexto.profesionalesPermitidos.includes(profesionalId)) return null;
  const { data } = await admin.from("profesionales").select("*").eq("id", profesionalId).eq("cuenta_id", contexto.cuentaId).eq("estado", "activo").maybeSingle();
  return data;
}

async function consultarDisponibilidad(admin: AdminClient, contexto: ContextoAgente, input: { profesional_id?: string; fecha?: string }) {
  if (!input.profesional_id || !input.fecha) return { error: "Faltan profesional_id o fecha" };

  const profesional = await obtenerProfesionalDeCuenta(admin, contexto, input.profesional_id);
  if (!profesional) return { error: "No existe ese profesional activo en esta cuenta -- usa un id de la lista de PROFESIONALES DISPONIBLES." };

  const [{ data: bloques }, { data: citas }] = await Promise.all([
    admin.from("cita_bloques_tiempo").select("fecha_inicio, fecha_fin, hora_inicio, hora_fin").eq("profesional_id", input.profesional_id),
    admin
      .from("citas_agendadas")
      .select("fecha, hora_inicio, hora_fin")
      .eq("profesional_id", input.profesional_id)
      .neq("estado", "cancelada")
      .eq("fecha", input.fecha),
  ]);

  const ocupadoGoogle =
    profesional.google_oauth_token_cifrado && profesional.google_calendar_id
      ? await obtenerOcupacionGoogle({ profesional, desde: fechaHoraMexico(input.fecha, "00:00"), hasta: fechaHoraMexico(input.fecha, "23:59") })
      : [];

  const slots = calcularSlotsDisponibles({
    profesional,
    bloques: bloques ?? [],
    citas: citas ?? [],
    ocupadoGoogle,
    fechaInicio: input.fecha,
    fechaFin: input.fecha,
  });

  const diaSemana = DIAS_SEMANA[new Date(`${input.fecha}T12:00:00`).getDay()];
  if (slots.length === 0 && !(profesional.dias_disponibles ?? []).includes(diaSemana)) {
    return { slots: [], motivo: `El profesional no atiende ese día de la semana (${diaSemana}).` };
  }

  return { slots: slots.map((s) => ({ hora_inicio: s.hora_inicio, hora_fin: s.hora_fin })) };
}

async function listarCitasContacto(admin: AdminClient, { cuentaId, contactoId, profesionalesPermitidos }: ContextoAgente) {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(new Date());

  let query = admin
    .from("citas_agendadas")
    .select("id, fecha, hora_inicio, hora_fin, estado, tipo_cita, profesional_id, profesionales(nombre, especialidad)")
    .eq("cuenta_id", cuentaId)
    .eq("contacto_id", contactoId)
    .neq("estado", "cancelada")
    .gte("fecha", hoy)
    .order("fecha", { ascending: true })
    .order("hora_inicio", { ascending: true });

  // Si este agente solo gestiona ciertos profesionales, no debe listarle (ni
  // dejarle referenciar) citas de un profesional fuera de su alcance.
  if (profesionalesPermitidos !== null) query = query.in("profesional_id", profesionalesPermitidos);

  const { data } = await query;
  return { citas: data ?? [] };
}

async function hayChoque(admin: AdminClient, profesionalId: string, fecha: string, horaInicio: string, horaFin: string, excluirCitaId?: string) {
  let query = admin
    .from("citas_agendadas")
    .select("id")
    .eq("profesional_id", profesionalId)
    .eq("fecha", fecha)
    .neq("estado", "cancelada")
    .lt("hora_inicio", horaFin)
    .gt("hora_fin", horaInicio);
  if (excluirCitaId) query = query.neq("id", excluirCitaId);
  const { data } = await query.maybeSingle();
  return !!data;
}

type ParametrosCrearCita = { profesional_id?: string; fecha?: string; hora_inicio?: string; hora_fin?: string; tipo_cita?: string; notas?: string };

async function crearCita(admin: AdminClient, contexto: ContextoAgente, input: ParametrosCrearCita) {
  const { cuentaId, contactoId, conversacionId } = contexto;
  if (!input.profesional_id || !input.fecha || !input.hora_inicio || !input.hora_fin) {
    return { error: "Faltan profesional_id, fecha, hora_inicio o hora_fin" };
  }

  const profesional = await obtenerProfesionalDeCuenta(admin, contexto, input.profesional_id);
  if (!profesional) return { error: "No existe ese profesional activo en esta cuenta -- usa un id de la lista de PROFESIONALES DISPONIBLES." };

  if (await hayChoque(admin, input.profesional_id, input.fecha, input.hora_inicio, input.hora_fin)) {
    return { error: "Ese horario ya no está disponible -- consulta disponibilidad de nuevo y ofrece otro horario." };
  }

  const { data: contacto } = await admin.from("contactos").select("nombre, nombre_completo, telefono").eq("id", contactoId).single();

  const googleEventId = await crearEventoGoogle({
    profesional,
    resumen: `${input.tipo_cita || "Cita"} — ${contacto?.nombre ?? contacto?.nombre_completo ?? contacto?.telefono ?? "Paciente"}`,
    descripcion: input.notas || "",
    inicio: fechaHoraMexico(input.fecha, input.hora_inicio),
    fin: fechaHoraMexico(input.fecha, input.hora_fin),
  });

  const { data: cita, error } = await admin
    .from("citas_agendadas")
    .insert({
      cuenta_id: cuentaId,
      contacto_id: contactoId,
      profesional_id: input.profesional_id,
      fecha: input.fecha,
      hora_inicio: input.hora_inicio,
      hora_fin: input.hora_fin,
      tipo_cita: input.tipo_cita ?? null,
      notas: input.notas ?? null,
      google_event_id: googleEventId,
      creado_por: "agente_ia",
    })
    .select()
    .single();

  if (error) return { error: error.message };

  await registrarActividad({
    cuentaId,
    perfilId: null,
    accion: "create_appointment",
    recursoTipo: "cita",
    recursoId: cita.id,
    detalles: { origen: "agente_ia", conversacion_id: conversacionId, profesional_id: input.profesional_id, fecha: input.fecha, hora_inicio: input.hora_inicio },
  });

  return { ok: true, cita_id: cita.id, fecha: cita.fecha, hora_inicio: cita.hora_inicio, hora_fin: cita.hora_fin, profesional: profesional.nombre };
}

type ParametrosReagendarCita = { cita_id?: string; fecha?: string; hora_inicio?: string; hora_fin?: string };

async function reagendarCita(admin: AdminClient, { cuentaId, contactoId, conversacionId, profesionalesPermitidos }: ContextoAgente, input: ParametrosReagendarCita) {
  if (!input.cita_id || !input.fecha || !input.hora_inicio || !input.hora_fin) {
    return { error: "Faltan cita_id, fecha, hora_inicio o hora_fin" };
  }

  const { data: cita } = await admin
    .from("citas_agendadas")
    .select("*, profesionales(*)")
    .eq("id", input.cita_id)
    .eq("cuenta_id", cuentaId)
    .eq("contacto_id", contactoId)
    .maybeSingle();

  if (!cita) return { error: "No encontré esa cita para este paciente -- usa listar_citas_contacto para obtener el id correcto." };

  if (profesionalesPermitidos !== null && !profesionalesPermitidos.includes(cita.profesional_id)) {
    return { error: "No tienes acceso para gestionar esa cita." };
  }

  if (await hayChoque(admin, cita.profesional_id, input.fecha, input.hora_inicio, input.hora_fin, cita.id)) {
    return { error: "Ese horario ya no está disponible -- consulta disponibilidad de nuevo y ofrece otro horario." };
  }

  if (cita.google_event_id && cita.profesionales) {
    await actualizarEventoGoogle({
      profesional: cita.profesionales,
      eventId: cita.google_event_id,
      inicio: fechaHoraMexico(input.fecha, input.hora_inicio),
      fin: fechaHoraMexico(input.fecha, input.hora_fin),
    });
  }

  const { error } = await admin
    .from("citas_agendadas")
    .update({ fecha: input.fecha, hora_inicio: input.hora_inicio, hora_fin: input.hora_fin, estado: "confirmada", updated_at: new Date().toISOString() })
    .eq("id", cita.id);

  if (error) return { error: error.message };

  await registrarActividad({
    cuentaId,
    perfilId: null,
    accion: "reschedule_appointment",
    recursoTipo: "cita",
    recursoId: cita.id,
    detalles: { origen: "agente_ia", conversacion_id: conversacionId, fecha: input.fecha, hora_inicio: input.hora_inicio },
  });

  return { ok: true, cita_id: cita.id, fecha: input.fecha, hora_inicio: input.hora_inicio, hora_fin: input.hora_fin };
}

async function cancelarCita(admin: AdminClient, { cuentaId, contactoId, conversacionId, profesionalesPermitidos }: ContextoAgente, input: { cita_id?: string }) {
  if (!input.cita_id) return { error: "Falta cita_id" };

  const { data: cita } = await admin
    .from("citas_agendadas")
    .select("*, profesionales(*)")
    .eq("id", input.cita_id)
    .eq("cuenta_id", cuentaId)
    .eq("contacto_id", contactoId)
    .maybeSingle();

  if (!cita) return { error: "No encontré esa cita para este paciente -- usa listar_citas_contacto para obtener el id correcto." };

  if (profesionalesPermitidos !== null && !profesionalesPermitidos.includes(cita.profesional_id)) {
    return { error: "No tienes acceso para gestionar esa cita." };
  }

  if (cita.google_event_id && cita.profesionales) {
    await eliminarEventoGoogle({ profesional: cita.profesionales, eventId: cita.google_event_id });
  }

  const { error } = await admin.from("citas_agendadas").update({ estado: "cancelada", updated_at: new Date().toISOString() }).eq("id", cita.id);
  if (error) return { error: error.message };

  await registrarActividad({
    cuentaId,
    perfilId: null,
    accion: "cancel_appointment",
    recursoTipo: "cita",
    recursoId: cita.id,
    detalles: { origen: "agente_ia", conversacion_id: conversacionId },
  });

  return { ok: true };
}
