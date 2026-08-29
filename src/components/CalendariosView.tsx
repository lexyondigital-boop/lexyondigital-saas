"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { SelectorContacto, type ContactoSeleccionado } from "@/components/SelectorContacto";

type Profesional = {
  id: string;
  nombre: string;
  especialidad: string;
  color_agenda: string;
  estado: "activo" | "inactivo";
  duracion_cita_minutos: number;
};

type Cita = {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  tipo_cita: string | null;
  notas: string | null;
  estado: "agendada" | "confirmada" | "cancelada" | "completada";
  creado_por: "agente_ia" | "usuario_manual";
  profesional_id: string;
  contactos: { nombre: string | null; nombre_completo: string | null; telefono: string } | null;
  profesionales: { nombre: string; especialidad: string; color_agenda: string } | null;
};

type Vista = "dia" | "semana" | "mes";

const HORA_INICIO_GRID = 0;
const HORA_FIN_GRID = 24;
const ALTURA_HORA = 56;
// Alto visible por default: 14h (7am-9pm, el rango de trabajo típico) — el
// resto de las 24h queda arriba/abajo con scroll para horarios fuera de lo
// común (ej. citas a las 11pm si así lo configuró el profesional).
const ALTO_VISIBLE_GRID = 14 * ALTURA_HORA;
const HORA_SCROLL_INICIAL = 7;
const DIAS_SEMANA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function inicioDeSemana(d: Date) {
  const r = new Date(d);
  const dia = r.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  r.setDate(r.getDate() + diff);
  return r;
}
function horaAMinutos(h: string) {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
}

export function CalendariosView({ cuentaId, puedeGestionar }: { cuentaId: string; puedeGestionar: boolean }) {
  const [vista, setVista] = useState<Vista>("semana");
  const [fechaRef, setFechaRef] = useState(new Date());
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [visibles, setVisibles] = useState<Set<string>>(new Set());
  const [citas, setCitas] = useState<Cita[]>([]);
  const [cargando, setCargando] = useState(true);
  const [citaSeleccionada, setCitaSeleccionada] = useState<Cita | null>(null);
  const [mostrarNuevaCita, setMostrarNuevaCita] = useState<{ profesionalId?: string; fecha?: string; hora?: string } | null>(null);

  const { desde, hasta, titulo } = useMemo(() => {
    if (vista === "dia") {
      const f = iso(fechaRef);
      return { desde: f, hasta: f, titulo: fechaRef.toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) };
    }
    if (vista === "semana") {
      const inicio = inicioDeSemana(fechaRef);
      const fin = addDays(inicio, 6);
      return {
        desde: iso(inicio),
        hasta: iso(fin),
        titulo: `${inicio.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })} — ${fin.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}`,
      };
    }
    const inicioMes = new Date(fechaRef.getFullYear(), fechaRef.getMonth(), 1);
    const finMes = new Date(fechaRef.getFullYear(), fechaRef.getMonth() + 1, 0);
    return {
      desde: iso(inicioDeSemana(inicioMes)),
      hasta: iso(addDays(inicioDeSemana(finMes), 6)),
      titulo: fechaRef.toLocaleDateString("es-MX", { month: "long", year: "numeric" }),
    };
  }, [vista, fechaRef]);

  async function cargarProfesionales() {
    const res = await fetch("/api/profesionales");
    const data = await res.json();
    const activos: Profesional[] = (data.profesionales ?? []).filter((p: Profesional) => p.estado === "activo");
    setProfesionales(activos);
    setVisibles(new Set(activos.map((p) => p.id)));
  }

  async function cargarCitas() {
    setCargando(true);
    const res = await fetch(`/api/citas?fecha_inicio=${desde}&fecha_fin=${hasta}`);
    const data = await res.json();
    setCitas((data.citas ?? []).filter((c: Cita) => c.estado !== "cancelada"));
    setCargando(false);
  }

  useEffect(() => {
    cargarProfesionales();
  }, []);

  useEffect(() => {
    cargarCitas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  const citasVisibles = citas.filter((c) => visibles.has(c.profesional_id));

  function alternarVisible(id: string) {
    setVisibles((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function navegar(direccion: -1 | 1) {
    if (vista === "dia") setFechaRef((f) => addDays(f, direccion));
    else if (vista === "semana") setFechaRef((f) => addDays(f, 7 * direccion));
    else setFechaRef((f) => new Date(f.getFullYear(), f.getMonth() + direccion, 1));
  }

  async function cancelarCita(id: string) {
    if (!confirm("¿Cancelar esta cita?")) return;
    await fetch(`/api/citas/${id}/cancelar`, { method: "POST" });
    setCitaSeleccionada(null);
    cargarCitas();
  }

  const diasVisibles = vista === "mes" ? diasDelRango(desde, hasta) : vista === "semana" ? diasDelRango(desde, hasta) : [new Date(`${desde}T00:00:00`)];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-texto)]">Calendarios</h1>
          <p className="mt-1 text-sm capitalize text-[var(--color-texto-mute)]">{titulo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setFechaRef(new Date())} className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-1.5 text-sm font-medium text-[var(--color-texto)] hover:opacity-80">
            Hoy
          </button>
          <button onClick={() => navegar(-1)} className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-2.5 py-1.5 text-sm text-[var(--color-texto)] hover:opacity-80">
            ←
          </button>
          <button onClick={() => navegar(1)} className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-2.5 py-1.5 text-sm text-[var(--color-texto)] hover:opacity-80">
            →
          </button>
          <div className="ml-1 flex rounded-lg border border-[var(--color-borde)] p-0.5">
            {(["dia", "semana", "mes"] as Vista[]).map((v) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                className="rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors"
                style={vista === v ? { background: "var(--color-marca)", color: "var(--color-accion-fg)" } : { color: "var(--color-texto-mute)" }}
              >
                {v}
              </button>
            ))}
          </div>
          {puedeGestionar && (
            <button
              onClick={() => setMostrarNuevaCita({})}
              style={{ boxShadow: "var(--halo-accion)" }}
              className="ml-1 rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
            >
              + Agendar cita
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-5">
        <aside className="w-48 shrink-0 space-y-1.5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-texto-mute)]">Profesionales</p>
          {profesionales.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-[var(--color-texto)] hover:bg-[var(--color-bg-elevada)]">
              <input type="checkbox" checked={visibles.has(p.id)} onChange={() => alternarVisible(p.id)} />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color_agenda }} />
              <span className="truncate">{p.nombre}</span>
            </label>
          ))}
          {profesionales.length === 0 && <p className="text-xs text-[var(--color-texto-mute)]">Sin profesionales activos.</p>}
        </aside>

        <div className="min-w-0 flex-1 overflow-x-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)]">
          {cargando ? (
            <p className="p-6 text-sm text-[var(--color-texto-mute)]">Cargando…</p>
          ) : vista === "mes" ? (
            <VistaMes
              dias={diasVisibles}
              mesRef={fechaRef}
              citas={citasVisibles}
              onClickCita={setCitaSeleccionada}
              onClickDia={(f) => {
                setFechaRef(f);
                setVista("dia");
              }}
            />
          ) : (
            <VistaGrid dias={diasVisibles} citas={citasVisibles} onClickCita={setCitaSeleccionada} onClickSlot={puedeGestionar ? (p) => setMostrarNuevaCita(p) : undefined} />
          )}
        </div>
      </div>

      {citaSeleccionada && (
        <ModalDetalleCita
          cita={citaSeleccionada}
          puedeGestionar={puedeGestionar}
          onCerrar={() => setCitaSeleccionada(null)}
          onCancelar={() => cancelarCita(citaSeleccionada.id)}
          onReagendada={() => {
            setCitaSeleccionada(null);
            cargarCitas();
          }}
        />
      )}

      {mostrarNuevaCita && (
        <ModalNuevaCita
          cuentaId={cuentaId}
          profesionales={profesionales}
          inicial={mostrarNuevaCita}
          onCerrar={() => setMostrarNuevaCita(null)}
          onGuardada={() => {
            setMostrarNuevaCita(null);
            cargarCitas();
          }}
        />
      )}
    </div>
  );
}

function diasDelRango(desde: string, hasta: string): Date[] {
  const dias: Date[] = [];
  let cursor = new Date(`${desde}T00:00:00`);
  const fin = new Date(`${hasta}T00:00:00`);
  while (cursor <= fin) {
    dias.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return dias;
}

// ============================================================
// VISTA DÍA / SEMANA (grid de horas)
// ============================================================

function VistaGrid({
  dias,
  citas,
  onClickCita,
  onClickSlot,
}: {
  dias: Date[];
  citas: Cita[];
  onClickCita: (c: Cita) => void;
  onClickSlot?: (info: { fecha: string; hora: string }) => void;
}) {
  const horas = Array.from({ length: HORA_FIN_GRID - HORA_INICIO_GRID }, (_, i) => HORA_INICIO_GRID + i);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = HORA_SCROLL_INICIAL * ALTURA_HORA;
  }, []);

  return (
    <div className="min-w-[600px]">
      <div className="flex">
        <div className="w-14 shrink-0 border-r border-[var(--color-borde)]" />
        {dias.map((dia) => (
          <div key={iso(dia)} className="min-w-[140px] flex-1 border-b border-r border-[var(--color-borde)] p-2 text-center last:border-r-0">
            <p className="text-xs uppercase text-[var(--color-texto-mute)]">{DIAS_SEMANA_CORTO[dia.getDay()]}</p>
            <p className="text-sm font-semibold text-[var(--color-texto)]">{dia.getDate()}</p>
          </div>
        ))}
      </div>
      <div ref={scrollRef} className="flex overflow-y-auto" style={{ maxHeight: ALTO_VISIBLE_GRID }}>
        <div className="w-14 shrink-0 border-r border-[var(--color-borde)]">
          {horas.map((h) => (
            <div key={h} style={{ height: ALTURA_HORA }} className="pr-2 text-right text-xs text-[var(--color-texto-mute)]">
              {h.toString().padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {dias.map((dia) => {
          const f = iso(dia);
          const citasDelDia = citas.filter((c) => c.fecha === f);
          return (
            <div key={f} className="relative min-w-[140px] flex-1 border-r border-[var(--color-borde)] last:border-0" style={{ height: (HORA_FIN_GRID - HORA_INICIO_GRID) * ALTURA_HORA }}>
              {horas.map((h) => (
                <div
                  key={h}
                  onClick={() => onClickSlot?.({ fecha: f, hora: `${h.toString().padStart(2, "0")}:00` })}
                  style={{ height: ALTURA_HORA }}
                  className={`border-b border-[var(--color-borde)] ${onClickSlot ? "cursor-pointer hover:bg-[var(--color-bg-elevada)]" : ""}`}
                />
              ))}
              {citasDelDia.map((c) => {
                const inicioMin = horaAMinutos(c.hora_inicio) - HORA_INICIO_GRID * 60;
                const finMin = horaAMinutos(c.hora_fin) - HORA_INICIO_GRID * 60;
                const top = (inicioMin / 60) * ALTURA_HORA;
                const alto = Math.max(((finMin - inicioMin) / 60) * ALTURA_HORA, 22);
                const color = c.profesionales?.color_agenda ?? "#6b2fa0";
                return (
                  <button
                    key={c.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClickCita(c);
                    }}
                    style={{ top, height: alto, background: color }}
                    className="absolute left-1 right-1 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight text-white shadow-sm"
                  >
                    <span className="block truncate font-semibold">{c.hora_inicio} {c.contactos?.nombre ?? c.contactos?.nombre_completo ?? c.contactos?.telefono}</span>
                    <span className="block truncate opacity-90">{c.profesionales?.nombre}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// VISTA MES
// ============================================================

function VistaMes({
  dias,
  mesRef,
  citas,
  onClickCita,
  onClickDia,
}: {
  dias: Date[];
  mesRef: Date;
  citas: Cita[];
  onClickCita: (c: Cita) => void;
  onClickDia: (f: Date) => void;
}) {
  const semanas: Date[][] = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));

  return (
    <div className="min-w-[700px]">
      <div className="grid grid-cols-7 border-b border-[var(--color-borde)]">
        {DIAS_SEMANA_CORTO.map((d) => (
          <div key={d} className="p-2 text-center text-xs font-medium uppercase text-[var(--color-texto-mute)]">
            {d}
          </div>
        ))}
      </div>
      {semanas.map((semana, i) => (
        <div key={i} className="grid grid-cols-7 border-b border-[var(--color-borde)] last:border-0">
          {semana.map((dia) => {
            const f = iso(dia);
            const citasDelDia = citas.filter((c) => c.fecha === f).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
            const esOtroMes = dia.getMonth() !== mesRef.getMonth();
            return (
              <div
                key={f}
                onClick={() => onClickDia(dia)}
                className="min-h-[110px] cursor-pointer border-r border-[var(--color-borde)] p-1.5 last:border-0 hover:bg-[var(--color-bg-elevada)]"
              >
                <p className={`mb-1 text-xs font-medium ${esOtroMes ? "text-[var(--color-texto-mute)] opacity-50" : "text-[var(--color-texto)]"}`}>{dia.getDate()}</p>
                <div className="space-y-0.5">
                  {citasDelDia.slice(0, 3).map((c) => (
                    <button
                      key={c.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onClickCita(c);
                      }}
                      style={{ background: c.profesionales?.color_agenda ?? "#6b2fa0" }}
                      className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] text-white"
                    >
                      {c.hora_inicio} {c.contactos?.nombre ?? c.contactos?.nombre_completo ?? c.contactos?.telefono}
                    </button>
                  ))}
                  {citasDelDia.length > 3 && <p className="text-[10px] text-[var(--color-texto-mute)]">+{citasDelDia.length - 3} más</p>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// MODAL: DETALLE / REAGENDAR / CANCELAR
// ============================================================

function ModalDetalleCita({
  cita,
  puedeGestionar,
  onCerrar,
  onCancelar,
  onReagendada,
}: {
  cita: Cita;
  puedeGestionar: boolean;
  onCerrar: () => void;
  onCancelar: () => void;
  onReagendada: () => void;
}) {
  const [reagendando, setReagendando] = useState(false);
  const [fecha, setFecha] = useState(cita.fecha);
  const [horaInicio, setHoraInicio] = useState(cita.hora_inicio);
  const [horaFin, setHoraFin] = useState(cita.hora_fin);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardarReagendo(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/citas/${cita.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha, hora_inicio: horaInicio, hora_fin: horaFin }),
    });
    setEnviando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo reagendar");
      return;
    }
    onReagendada();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: cita.profesionales?.color_agenda ?? "#6b2fa0" }} />
          <h2 className="text-base font-semibold text-[var(--color-texto)]">{cita.contactos?.nombre ?? cita.contactos?.nombre_completo ?? cita.contactos?.telefono}</h2>
        </div>

        {!reagendando ? (
          <div className="space-y-1.5 text-sm text-[var(--color-texto)]">
            <p>
              📅 {new Date(`${cita.fecha}T00:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long" })}
            </p>
            <p>
              🕐 {cita.hora_inicio} – {cita.hora_fin}
            </p>
            <p>👤 {cita.profesionales?.nombre} · {cita.profesionales?.especialidad}</p>
            {cita.tipo_cita && <p>📋 {cita.tipo_cita}</p>}
            {cita.notas && <p className="text-[var(--color-texto-mute)]">{cita.notas}</p>}
            {cita.creado_por === "agente_ia" && <p className="text-[var(--color-texto-mute)]">🤖 Agendada por el Agente IA</p>}
          </div>
        ) : (
          <form onSubmit={guardarReagendo} className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-3 block text-sm">
                <span className="mb-1 block text-[var(--color-texto)]">Fecha</span>
                <input required type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)]" />
              </label>
              <label className="col-span-1 block text-sm">
                <span className="mb-1 block text-[var(--color-texto)]">Inicio</span>
                <input required type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-2 py-2 text-sm text-[var(--color-texto)]" />
              </label>
              <label className="col-span-1 block text-sm">
                <span className="mb-1 block text-[var(--color-texto)]">Fin</span>
                <input required type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-2 py-2 text-sm text-[var(--color-texto)]" />
              </label>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={enviando} style={{ boxShadow: "var(--halo-accion)" }} className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] disabled:opacity-60">
                {enviando ? "Guardando…" : "Confirmar cambio"}
              </button>
              <button type="button" onClick={() => setReagendando(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
                Cancelar
              </button>
            </div>
          </form>
        )}

        {!reagendando && (
          <div className="flex gap-3 border-t border-[var(--color-borde)] pt-4">
            {puedeGestionar && (
              <>
                <button onClick={() => setReagendando(true)} className="text-sm font-medium text-[var(--color-marca)] hover:underline">
                  Reagendar
                </button>
                <button onClick={onCancelar} className="text-sm font-medium text-red-500 hover:underline">
                  Cancelar cita
                </button>
              </>
            )}
            <button onClick={onCerrar} className="ml-auto text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MODAL: NUEVA CITA
// ============================================================

function sumarMinutos(hora: string, minutos: number): string {
  const total = horaAMinutos(hora) + minutos;
  const h = Math.floor(((total % 1440) + 1440) % 1440 / 60).toString().padStart(2, "0");
  const m = (total % 60 < 0 ? total % 60 + 60 : total % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function ModalNuevaCita({
  cuentaId,
  profesionales,
  inicial,
  onCerrar,
  onGuardada,
}: {
  cuentaId: string;
  profesionales: Profesional[];
  inicial: { profesionalId?: string; fecha?: string; hora?: string };
  onCerrar: () => void;
  onGuardada: () => void;
}) {
  const [profesionalId, setProfesionalId] = useState(inicial.profesionalId ?? profesionales[0]?.id ?? "");
  const [mostrarSelectorContacto, setMostrarSelectorContacto] = useState(false);
  const [contacto, setContacto] = useState<ContactoSeleccionado | null>(null);
  const [fecha, setFecha] = useState(inicial.fecha ?? "");
  const [horaInicio, setHoraInicio] = useState(inicial.hora ?? "");
  const [horaFin, setHoraFin] = useState("");
  const [slots, setSlots] = useState<{ hora_inicio: string; hora_fin: string }[]>([]);
  const [tipoCita, setTipoCita] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const profesional = profesionales.find((p) => p.id === profesionalId) ?? null;

  useEffect(() => {
    if (!fecha || !profesionalId) {
      setSlots([]);
      return;
    }
    (async () => {
      const res = await fetch(`/api/profesionales/${profesionalId}/disponibilidad?fecha_inicio=${fecha}&fecha_fin=${fecha}`);
      const data = await res.json();
      setSlots(data.slots ?? []);
    })();
  }, [fecha, profesionalId]);

  useEffect(() => {
    if (inicial.hora && profesional) setHoraFin(sumarMinutos(inicial.hora, profesional.duracion_cita_minutos));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profesional?.id]);

  function elegirHoraInicio(valor: string) {
    setHoraInicio(valor);
    if (valor && profesional) setHoraFin(sumarMinutos(valor, profesional.duracion_cita_minutos));
  }

  function elegirSlot(s: { hora_inicio: string; hora_fin: string }) {
    // Si el bloque tocado es contiguo al rango ya elegido, lo extiende en vez
    // de reemplazarlo -- así se arman citas más largas encadenando varios
    // bloques sugeridos (para pacientes que necesitan más que la duración
    // default del profesional).
    if (horaInicio && horaFin) {
      if (s.hora_inicio === horaFin) {
        setHoraFin(s.hora_fin);
        return;
      }
      if (s.hora_fin === horaInicio) {
        setHoraInicio(s.hora_inicio);
        return;
      }
    }
    setHoraInicio(s.hora_inicio);
    setHoraFin(s.hora_fin);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!contacto || !fecha || !horaInicio || !horaFin || !profesionalId) {
      setError("Completa profesional, contacto, fecha y horario");
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
    onGuardada();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={guardar} className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <h2 className="text-base font-semibold text-[var(--color-texto)]">Agendar cita</h2>

        <label className="block text-sm">
          <span className="mb-1 block text-[var(--color-texto)]">Profesional</span>
          <select required value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)]">
            <option value="" disabled>
              Selecciona…
            </option>
            {profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {p.especialidad}
              </option>
            ))}
          </select>
        </label>

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
            <span className="text-[var(--color-texto)]">{contacto.nombre ?? contacto.nombre_completo ?? contacto.telefono}</span>
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

        {fecha && profesionalId && (
          <div>
            <span className="mb-1.5 block text-sm text-[var(--color-texto)]">Horarios sugeridos (hora de México)</span>
            {slots.length === 0 ? (
              <p className="text-xs text-[var(--color-texto-mute)]">Sin horarios libres calculados ese día — puedes capturar la hora manualmente.</p>
            ) : (
              <>
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                  {slots.map((s) => {
                    const seleccionado = !!horaInicio && !!horaFin && s.hora_inicio >= horaInicio && s.hora_fin <= horaFin;
                    return (
                      <button
                        key={s.hora_inicio}
                        type="button"
                        onClick={() => elegirSlot(s)}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium"
                        style={
                          seleccionado
                            ? { background: "var(--color-marca)", color: "var(--color-accion-fg)" }
                            : { background: "var(--color-bg-elevada)", color: "var(--color-texto)", border: "1px solid var(--color-borde)" }
                        }
                      >
                        {s.hora_inicio}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-[var(--color-texto-mute)]">
                  ¿La cita dura más? Toca otro bloque seguido al ya elegido para extenderla.
                </p>
              </>
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
