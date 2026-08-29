import type { RangoOcupado } from "@/lib/google-calendar";

export type SlotDisponible = { fecha: string; hora_inicio: string; hora_fin: string };

type Profesional = {
  horario_inicio: string;
  horario_fin: string;
  dias_disponibles: string[];
  duracion_cita_minutos: number;
};

type BloqueTiempo = { fecha_inicio: string; fecha_fin: string; hora_inicio: string; hora_fin: string };

type Cita = { fecha: string; hora_inicio: string; hora_fin: string };

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function minutosAHora(min: number): string {
  const h = Math.floor(min / 60)
    .toString()
    .padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function fechaISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

// Google Calendar regresa los rangos ocupados en UTC. El servidor corre en
// UTC, así que un ".getHours()" normal daría la hora UTC, no la hora local
// de México (fija en UTC-6 desde que el país eliminó el horario de verano) —
// eso desfasaba 6h las comparaciones contra el horario laboral del profesional.
function utcAMexico(fechaUTC: Date): { fecha: string; minutos: number } {
  const desplazado = new Date(fechaUTC.getTime() - 6 * 60 * 60 * 1000);
  const fecha = `${desplazado.getUTCFullYear()}-${String(desplazado.getUTCMonth() + 1).padStart(2, "0")}-${String(desplazado.getUTCDate()).padStart(2, "0")}`;
  const minutos = desplazado.getUTCHours() * 60 + desplazado.getUTCMinutes();
  return { fecha, minutos };
}

// Calcula los slots libres de un profesional en un rango de fechas,
// combinando: horario laboral + días disponibles, duración de cita,
// bloqueos manuales (vacaciones/conferencias), citas ya agendadas, y
// (si está conectado) los eventos ocupados de Google Calendar.
export function calcularSlotsDisponibles({
  profesional,
  bloques,
  citas,
  ocupadoGoogle,
  fechaInicio,
  fechaFin,
  duracionMinutos,
}: {
  profesional: Profesional;
  bloques: BloqueTiempo[];
  citas: Cita[];
  ocupadoGoogle: RangoOcupado[];
  fechaInicio: string;
  fechaFin: string;
  duracionMinutos?: number;
}): SlotDisponible[] {
  const duracion = duracionMinutos ?? profesional.duracion_cita_minutos;
  const slots: SlotDisponible[] = [];

  const inicio = new Date(`${fechaInicio}T00:00:00`);
  const fin = new Date(`${fechaFin}T00:00:00`);

  for (let cursor = new Date(inicio); cursor <= fin; cursor.setDate(cursor.getDate() + 1)) {
    const fecha = fechaISO(cursor);
    const diaSemana = DIAS_SEMANA[cursor.getDay()];
    if (!profesional.dias_disponibles.includes(diaSemana)) continue;

    const inicioMin = horaAMinutos(profesional.horario_inicio);
    const finMin = horaAMinutos(profesional.horario_fin);

    const ocupadosDelDia: { inicio: number; fin: number }[] = [];

    for (const b of bloques) {
      if (fecha >= b.fecha_inicio && fecha <= b.fecha_fin) {
        ocupadosDelDia.push({ inicio: horaAMinutos(b.hora_inicio), fin: horaAMinutos(b.hora_fin) });
      }
    }

    for (const c of citas) {
      if (c.fecha === fecha) {
        ocupadosDelDia.push({ inicio: horaAMinutos(c.hora_inicio), fin: horaAMinutos(c.hora_fin) });
      }
    }

    for (const g of ocupadoGoogle) {
      const gInicio = utcAMexico(new Date(g.inicio));
      const gFin = utcAMexico(new Date(g.fin));
      if (gInicio.fecha === fecha || gFin.fecha === fecha) {
        ocupadosDelDia.push({
          inicio: gInicio.fecha === fecha ? gInicio.minutos : 0,
          fin: gFin.fecha === fecha ? gFin.minutos : 24 * 60,
        });
      }
    }

    for (let t = inicioMin; t + duracion <= finMin; t += duracion) {
      const solapa = ocupadosDelDia.some((o) => t < o.fin && t + duracion > o.inicio);
      if (!solapa) {
        slots.push({ fecha, hora_inicio: minutosAHora(t), hora_fin: minutosAHora(t + duracion) });
      }
    }
  }

  return slots;
}

export function calcularSlotsComunes(
  slotsPorProfesional: Record<string, SlotDisponible[]>,
): { fecha: string; hora_inicio: string; hora_fin: string; disponibles: string[] }[] {
  const ids = Object.keys(slotsPorProfesional);
  if (ids.length === 0) return [];

  const clave = (s: SlotDisponible) => `${s.fecha}|${s.hora_inicio}|${s.hora_fin}`;
  const porClave = new Map<string, { fecha: string; hora_inicio: string; hora_fin: string; disponibles: string[] }>();

  for (const id of ids) {
    for (const s of slotsPorProfesional[id]) {
      const k = clave(s);
      if (!porClave.has(k)) porClave.set(k, { fecha: s.fecha, hora_inicio: s.hora_inicio, hora_fin: s.hora_fin, disponibles: [] });
      porClave.get(k)!.disponibles.push(id);
    }
  }

  return [...porClave.values()].filter((s) => s.disponibles.length === ids.length).sort((a, b) => (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio));
}
