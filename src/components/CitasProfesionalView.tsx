"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/Badge";
import { SelectorContacto, type ContactoSeleccionado } from "@/components/SelectorContacto";

type Cita = {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  tipo_cita: string | null;
  notas: string | null;
  estado: "agendada" | "confirmada" | "cancelada" | "completada";
  creado_por: "agente_ia" | "usuario_manual";
  contactos: { nombre: string | null; telefono: string } | null;
};

type Bloque = { id: string; fecha_inicio: string; fecha_fin: string; hora_inicio: string; hora_fin: string; razon: string | null };

function inicioDeSemana(fecha: Date) {
  const d = new Date(fecha);
  const dia = d.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + diff);
  return d;
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function CitasProfesionalView({
  cuentaId,
  profesionalId,
  nombreProfesional,
}: {
  cuentaId: string;
  profesionalId: string;
  nombreProfesional: string;
}) {
  const supabase = createClient();
  const [semana, setSemana] = useState(() => inicioDeSemana(new Date()));
  const [citas, setCitas] = useState<Cita[]>([]);
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarBloqueo, setMostrarBloqueo] = useState(false);
  const [mostrarAgendar, setMostrarAgendar] = useState(false);

  const desde = iso(semana);
  const finSemana = new Date(semana);
  finSemana.setDate(finSemana.getDate() + 6);
  const hasta = iso(finSemana);

  async function cargar() {
    setCargando(true);
    const [resCitas, { data: bloquesData }] = await Promise.all([
      fetch(`/api/citas?profesional_id=${profesionalId}&fecha_inicio=${desde}&fecha_fin=${hasta}`),
      supabase.from("cita_bloques_tiempo").select("*").eq("profesional_id", profesionalId).lte("fecha_inicio", hasta).gte("fecha_fin", desde),
    ]);
    const dataCitas = await resCitas.json();
    setCitas(dataCitas.citas ?? []);
    setBloques(bloquesData ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  async function cancelar(id: string) {
    if (!confirm("¿Cancelar esta cita?")) return;
    await fetch(`/api/citas/${id}/cancelar`, { method: "POST" });
    cargar();
  }

  async function eliminarBloqueo(id: string) {
    if (!confirm("¿Eliminar este bloqueo de horario?")) return;
    await fetch(`/api/cita-bloques/${id}`, { method: "DELETE" });
    cargar();
  }

  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(semana);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--color-texto)]">Citas — {nombreProfesional}</h1>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setSemana((s) => { const d = new Date(s); d.setDate(d.getDate() - 7); return d; })} className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-1.5 text-sm text-[var(--color-texto)] hover:opacity-80">
            ← Semana anterior
          </button>
          <span className="px-2 text-sm text-[var(--color-texto-mute)]">
            {desde} — {hasta}
          </span>
          <button onClick={() => setSemana((s) => { const d = new Date(s); d.setDate(d.getDate() + 7); return d; })} className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-1.5 text-sm text-[var(--color-texto)] hover:opacity-80">
            Semana siguiente →
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMostrarBloqueo(true)} className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80">
            Bloquear horario
          </button>
          <button onClick={() => setMostrarAgendar(true)} style={{ boxShadow: "var(--halo-accion)" }} className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90">
            + Agendar cita
          </button>
        </div>
      </div>

      {cargando ? (
        <p className="mt-6 text-sm text-[var(--color-texto-mute)]">Cargando…</p>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dias.map((d) => {
            const f = iso(d);
            const citasDelDia = citas.filter((c) => c.fecha === f).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
            const bloquesDelDia = bloques.filter((b) => f >= b.fecha_inicio && f <= b.fecha_fin);
            return (
              <div key={f} className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-4">
                <p className="mb-2 text-sm font-semibold text-[var(--color-texto)]">
                  {d.toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "short" })}
                </p>
                {citasDelDia.length === 0 && bloquesDelDia.length === 0 && <p className="text-xs text-[var(--color-texto-mute)]">Sin citas.</p>}
                <div className="space-y-2">
                  {bloquesDelDia.map((b) => (
                    <div key={b.id} className="rounded-lg bg-[var(--color-bg-elevada)] p-2.5 text-xs text-[var(--color-texto-mute)]">
                      🚫 {b.hora_inicio}–{b.hora_fin} · {b.razon || "Bloqueado"}
                      <button onClick={() => eliminarBloqueo(b.id)} className="ml-2 text-red-500 hover:underline">
                        Quitar
                      </button>
                    </div>
                  ))}
                  {citasDelDia.map((c) => (
                    <div key={c.id} className="rounded-lg border border-[var(--color-borde)] p-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[var(--color-texto)]">
                          {c.hora_inicio}–{c.hora_fin}
                        </span>
                        <Badge tono={c.estado === "cancelada" ? "mute" : "en-vivo"}>{c.estado}</Badge>
                      </div>
                      <p className="mt-1 text-[var(--color-texto)]">{c.contactos?.nombre ?? c.contactos?.telefono ?? "—"}</p>
                      {c.tipo_cita && <p className="text-[var(--color-texto-mute)]">{c.tipo_cita}</p>}
                      {c.creado_por === "agente_ia" && <p className="text-[var(--color-texto-mute)]">🤖 Agendada por el Agente IA</p>}
                      {c.estado !== "cancelada" && (
                        <button onClick={() => cancelar(c.id)} className="mt-1 text-red-500 hover:underline">
                          Cancelar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mostrarBloqueo && <ModalBloqueo profesionalId={profesionalId} onCerrar={() => setMostrarBloqueo(false)} onGuardado={() => { setMostrarBloqueo(false); cargar(); }} />}
      {mostrarAgendar && <ModalAgendar cuentaId={cuentaId} profesionalId={profesionalId} onCerrar={() => setMostrarAgendar(false)} onGuardado={() => { setMostrarAgendar(false); cargar(); }} />}
    </div>
  );
}

function ModalBloqueo({ profesionalId, onCerrar, onGuardado }: { profesionalId: string; onCerrar: () => void; onGuardado: () => void }) {
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [horaInicio, setHoraInicio] = useState("00:00");
  const [horaFin, setHoraFin] = useState("23:59");
  const [razon, setRazon] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    await fetch("/api/cita-bloques", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profesional_id: profesionalId, fecha_inicio: fechaInicio, fecha_fin: fechaFin || fechaInicio, hora_inicio: horaInicio, hora_fin: horaFin, razon }),
    });
    setEnviando(false);
    onGuardado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={guardar} className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <h2 className="text-base font-semibold text-[var(--color-texto)]">Bloquear horario</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-texto)]">Desde</span>
            <input required type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)]" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-texto)]">Hasta</span>
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)]" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-texto)]">Hora inicio</span>
            <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)]" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-texto)]">Hora fin</span>
            <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)]" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--color-texto)]">Razón</span>
          <input value={razon} onChange={(e) => setRazon(e.target.value)} placeholder="Vacaciones, conferencia…" className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)]" />
        </label>
        <div className="flex gap-3">
          <button type="submit" disabled={enviando} style={{ boxShadow: "var(--halo-accion)" }} className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] disabled:opacity-60">
            {enviando ? "Guardando…" : "Bloquear"}
          </button>
          <button type="button" onClick={onCerrar} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function horaAMinutosLocal(h: string) {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
}
function sumarMinutosLocal(hora: string, minutos: number): string {
  const total = ((horaAMinutosLocal(hora) + minutos) % 1440 + 1440) % 1440;
  return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}

function ModalAgendar({
  cuentaId,
  profesionalId,
  onCerrar,
  onGuardado,
}: {
  cuentaId: string;
  profesionalId: string;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [duracion, setDuracion] = useState(30);
  const [mostrarSelectorContacto, setMostrarSelectorContacto] = useState(false);
  const [contacto, setContacto] = useState<ContactoSeleccionado | null>(null);
  const [fecha, setFecha] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [slots, setSlots] = useState<{ hora_inicio: string; hora_fin: string }[]>([]);
  const [tipoCita, setTipoCita] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/profesionales/${profesionalId}`);
      const data = await res.json();
      if (data.profesional?.duracion_cita_minutos) setDuracion(data.profesional.duracion_cita_minutos);
    })();
  }, [profesionalId]);

  useEffect(() => {
    if (!fecha) {
      setSlots([]);
      return;
    }
    (async () => {
      const res = await fetch(`/api/profesionales/${profesionalId}/disponibilidad?fecha_inicio=${fecha}&fecha_fin=${fecha}`);
      const data = await res.json();
      setSlots(data.slots ?? []);
    })();
  }, [fecha, profesionalId]);

  function elegirHoraInicio(valor: string) {
    setHoraInicio(valor);
    if (valor) setHoraFin(sumarMinutosLocal(valor, duracion));
  }

  function elegirSlot(s: { hora_inicio: string; hora_fin: string }) {
    setHoraInicio(s.hora_inicio);
    setHoraFin(s.hora_fin);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!contacto || !fecha || !horaInicio || !horaFin) {
      setError("Selecciona contacto, fecha y horario");
      return;
    }
    setEnviando(true);
    setError(null);
    const res = await fetch("/api/citas/agendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contacto_id: contacto.id,
        profesional_ids: [profesionalId],
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        tipo_cita: tipoCita || undefined,
        notas: notas || undefined,
      }),
    });
    setEnviando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo agendar la cita");
      return;
    }
    onGuardado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={guardar} className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <h2 className="text-base font-semibold text-[var(--color-texto)]">Agendar cita</h2>

        {!contacto ? (
          <button
            type="button"
            onClick={() => setMostrarSelectorContacto(true)}
            className="w-full rounded-lg border border-dashed border-[var(--color-borde)] px-3 py-2 text-left text-sm text-[var(--color-texto-mute)] hover:opacity-80"
          >
            🔍 Buscar o crear contacto…
          </button>
        ) : (
          <div className="flex items-center justify-between rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm">
            <span className="text-[var(--color-texto)]">{contacto.nombre ?? contacto.telefono}</span>
            <button type="button" onClick={() => setMostrarSelectorContacto(true)} className="text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
              Cambiar
            </button>
          </div>
        )}

        <label className="block text-sm">
          <span className="mb-1 block text-[var(--color-texto)]">Fecha</span>
          <input required type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)]" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-texto)]">Hora inicio</span>
            <input required type="time" value={horaInicio} onChange={(e) => elegirHoraInicio(e.target.value)} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)]" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-texto)]">Hora fin</span>
            <input required type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)]" />
          </label>
        </div>

        {fecha && (
          <div>
            <span className="mb-1.5 block text-sm text-[var(--color-texto)]">Horarios sugeridos</span>
            {slots.length === 0 ? (
              <p className="text-xs text-[var(--color-texto-mute)]">Sin horarios libres calculados ese día — puedes capturar la hora manualmente.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {slots.map((s) => (
                  <button
                    key={s.hora_inicio}
                    type="button"
                    onClick={() => elegirSlot(s)}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium"
                    style={
                      horaInicio === s.hora_inicio
                        ? { background: "var(--color-marca)", color: "var(--color-accion-fg)" }
                        : { background: "var(--color-bg-elevada)", color: "var(--color-texto)", border: "1px solid var(--color-borde)" }
                    }
                  >
                    {s.hora_inicio}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="block text-sm">
          <span className="mb-1 block text-[var(--color-texto)]">Tipo de cita</span>
          <input value={tipoCita} onChange={(e) => setTipoCita(e.target.value)} placeholder="Consulta, seguimiento…" className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)]" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--color-texto)]">Notas</span>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)]" />
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={enviando} style={{ boxShadow: "var(--halo-accion)" }} className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] disabled:opacity-60">
            {enviando ? "Agendando…" : "Agendar"}
          </button>
          <button type="button" onClick={onCerrar} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
            Cancelar
          </button>
        </div>
      </form>

      {mostrarSelectorContacto && (
        <SelectorContacto
          cuentaId={cuentaId}
          onCerrar={() => setMostrarSelectorContacto(false)}
          onSeleccionar={(c) => {
            setContacto(c);
            setMostrarSelectorContacto(false);
          }}
        />
      )}
    </div>
  );
}
