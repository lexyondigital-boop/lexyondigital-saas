"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { DndContext, useDraggable, useDroppable, useSensor, useSensors, PointerSensor, type DragEndEvent } from "@dnd-kit/core";
import { LABEL_ACCION } from "@/lib/permisos";

type Etapa = {
  id: string;
  nombre: string;
  color: string;
  orden: number;
  probabilidad_default: number;
  es_ganada: boolean;
  es_perdida: boolean;
};

type Deal = {
  id: string;
  titulo: string;
  valor: number;
  contacto_id: string | null;
  etapa_id: string;
  propietario_id: string | null;
  estado: "abierto" | "ganado" | "perdido";
  probabilidad_manual: number | null;
  fecha_cierre_estimada: string | null;
  motivo_cierre: string | null;
  ultima_actividad_en: string;
  created_at: string;
};

type Tarea = {
  id: string;
  deal_id: string;
  tipo: "llamada" | "email" | "reunion" | "otro";
  titulo: string;
  descripcion: string | null;
  fecha_vencimiento: string;
  asignado_a: string | null;
  completada: boolean;
  completada_en: string | null;
};

type PerfilLite = { id: string; nombre: string | null };
type ContactoLite = { id: string; nombre: string | null; nombre_completo: string | null; telefono: string };
type EventoTimeline = { id: string; accion: string; detalles: Record<string, unknown>; created_at: string; perfil_id: string | null; perfiles: { nombre: string | null } | { nombre: string | null }[] | null };

const UMBRAL_DORMIDO_DIAS = 7;
const FORMATO_MONEDA = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const LABEL_TIPO_TAREA: Record<Tarea["tipo"], string> = { llamada: "Llamada", email: "Correo", reunion: "Reunión", otro: "Otro" };
const COLORES_PRESET = ["#8b5cf6", "#0ea5e9", "#f97316", "#eab308", "#22c55e", "#ef4444", "#64748b", "#ec4899"];

export const INPUT =
  "w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]";

function nombreContacto(c: ContactoLite | undefined | null): string {
  if (!c) return "Sin contacto";
  return c.nombre_completo || c.nombre || c.telefono;
}

function nombrePerfil(p: PerfilLite | undefined | null): string {
  return p?.nombre || "Sin asignar";
}

function probabilidadEfectiva(deal: Deal, etapasPorId: Map<string, Etapa>): number {
  if (deal.probabilidad_manual !== null) return deal.probabilidad_manual;
  return etapasPorId.get(deal.etapa_id)?.probabilidad_default ?? 0;
}

function esDormido(deal: Deal): boolean {
  if (deal.estado !== "abierto") return false;
  return Date.now() - new Date(deal.ultima_actividad_en).getTime() > UMBRAL_DORMIDO_DIAS * 24 * 60 * 60 * 1000;
}

function nombreDePerfilEnEvento(ev: EventoTimeline): string {
  const rel = Array.isArray(ev.perfiles) ? ev.perfiles[0] : ev.perfiles;
  return rel?.nombre || "Alguien";
}

async function jsonOError(res: Response): Promise<string | null> {
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.error ?? "Ocurrió un error";
}

type Tab = "tablero" | "etapas" | "tareas" | "estadisticas";

export function PipelineView({
  cuentaId,
  perfilId,
  puedeGestionar,
  puedeConfigurar,
}: {
  cuentaId: string;
  perfilId: string;
  puedeGestionar: boolean;
  puedeConfigurar: boolean;
}) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("tablero");
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [perfiles, setPerfiles] = useState<PerfilLite[]>([]);
  const [contactos, setContactos] = useState<ContactoLite[]>([]);
  const [cargando, setCargando] = useState(true);
  const [dealAbierto, setDealAbierto] = useState<string | null>(null);

  async function cargarTodo() {
    const [{ data: e }, { data: d }, { data: t }, { data: p }, { data: c }] = await Promise.all([
      supabase.from("etapas_pipeline").select("*").eq("cuenta_id", cuentaId).order("orden"),
      supabase.from("deals").select("*").eq("cuenta_id", cuentaId).order("created_at", { ascending: false }),
      supabase.from("tareas").select("*").eq("cuenta_id", cuentaId).order("fecha_vencimiento"),
      supabase.from("perfiles").select("id, nombre").eq("cuenta_id", cuentaId).eq("activo", true),
      supabase.from("contactos").select("id, nombre, nombre_completo, telefono").eq("cuenta_id", cuentaId),
    ]);
    setEtapas((e as Etapa[]) ?? []);
    setDeals((d as Deal[]) ?? []);
    setTareas((t as Tarea[]) ?? []);
    setPerfiles((p as PerfilLite[]) ?? []);
    setContactos((c as ContactoLite[]) ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargarTodo();

    const canal = supabase
      .channel(`pipeline-${cuentaId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `cuenta_id=eq.${cuentaId}` }, () => cargarTodo())
      .on("postgres_changes", { event: "*", schema: "public", table: "etapas_pipeline", filter: `cuenta_id=eq.${cuentaId}` }, () => cargarTodo())
      .on("postgres_changes", { event: "*", schema: "public", table: "tareas", filter: `cuenta_id=eq.${cuentaId}` }, () => cargarTodo())
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuentaId]);

  const etapasPorId = useMemo(() => new Map(etapas.map((e) => [e.id, e])), [etapas]);
  const perfilesPorId = useMemo(() => new Map(perfiles.map((p) => [p.id, p])), [perfiles]);
  const contactosPorId = useMemo(() => new Map(contactos.map((c) => [c.id, c])), [contactos]);

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--color-texto)]">Proceso comercial</h1>
      <p className="mt-1 text-sm text-[var(--color-texto-mute)]">Tu pipeline de ventas: etapas, deals, tareas y forecast.</p>

      <div className="mb-6 mt-5 flex gap-5 border-b border-[var(--color-borde)]">
        {(
          [
            ["tablero", "Tablero"],
            ["etapas", "Etapas"],
            ["tareas", "Tareas"],
            ["estadisticas", "Estadísticas"],
          ] as [Tab, string][]
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            onClick={() => setTab(valor)}
            className="border-b-2 pb-2.5 text-sm font-medium transition-colors"
            style={{
              borderColor: tab === valor ? "var(--color-marca)" : "transparent",
              color: tab === valor ? "var(--color-texto)" : "var(--color-texto-mute)",
            }}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {cargando ? (
        <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
      ) : (
        <>
          {tab === "tablero" && (
            <TableroTab
              etapas={etapas}
              deals={deals}
              contactosPorId={contactosPorId}
              perfilesPorId={perfilesPorId}
              perfiles={perfiles}
              contactos={contactos}
              puedeGestionar={puedeGestionar}
              onAbrirDeal={setDealAbierto}
              onRecargar={cargarTodo}
            />
          )}
          {tab === "etapas" && <EtapasTab etapas={etapas} deals={deals} puedeConfigurar={puedeConfigurar} onRecargar={cargarTodo} />}
          {tab === "tareas" && (
            <TareasTab
              tareas={tareas}
              deals={deals}
              perfiles={perfiles}
              perfilId={perfilId}
              puedeGestionar={puedeGestionar}
              onAbrirDeal={setDealAbierto}
              onRecargar={cargarTodo}
            />
          )}
          {tab === "estadisticas" && (
            <EstadisticasTab etapas={etapas} deals={deals} tareas={tareas} etapasPorId={etapasPorId} />
          )}
        </>
      )}

      {dealAbierto && (
        <DealPanel
          dealId={dealAbierto}
          deals={deals}
          tareas={tareas}
          etapas={etapas}
          contactos={contactos}
          contactosPorId={contactosPorId}
          perfiles={perfiles}
          perfilesPorId={perfilesPorId}
          puedeGestionar={puedeGestionar}
          onCerrar={() => setDealAbierto(null)}
          onCambiado={cargarTodo}
        />
      )}
    </div>
  );
}

// ============================================================
// Tablero (Kanban)
// ============================================================

function TableroTab({
  etapas,
  deals,
  contactosPorId,
  perfilesPorId,
  perfiles,
  contactos,
  puedeGestionar,
  onAbrirDeal,
  onRecargar,
}: {
  etapas: Etapa[];
  deals: Deal[];
  contactosPorId: Map<string, ContactoLite>;
  perfilesPorId: Map<string, PerfilLite>;
  perfiles: PerfilLite[];
  contactos: ContactoLite[];
  puedeGestionar: boolean;
  onAbrirDeal: (id: string) => void;
  onRecargar: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroPropietario, setFiltroPropietario] = useState("");
  const [incluirCerrados, setIncluirCerrados] = useState(false);
  const [etapaNuevoDeal, setEtapaNuevoDeal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const dealsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return deals.filter((d) => {
      if (!incluirCerrados && d.estado !== "abierto") return false;
      if (filtroPropietario && d.propietario_id !== filtroPropietario) return false;
      if (q) {
        const contacto = d.contacto_id ? contactosPorId.get(d.contacto_id) : null;
        const texto = `${d.titulo} ${nombreContacto(contacto)}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    });
  }, [deals, busqueda, filtroPropietario, incluirCerrados, contactosPorId]);

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const etapaDestinoId = String(over.id);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.etapa_id === etapaDestinoId) return;

    setError(null);
    const res = await fetch(`/api/deals/${dealId}/mover-etapa`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etapa_id: etapaDestinoId }),
    });
    const err = await jsonOError(res);
    if (err) setError(err);
    onRecargar();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por título o contacto…"
          className={`${INPUT} max-w-xs`}
        />
        <select value={filtroPropietario} onChange={(e) => setFiltroPropietario(e.target.value)} className={`${INPUT} max-w-[180px]`}>
          <option value="">Todos los propietarios</option>
          {perfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre || "Sin nombre"}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-[var(--color-texto-mute)]">
          <input type="checkbox" checked={incluirCerrados} onChange={(e) => setIncluirCerrados(e.target.checked)} />
          Incluir ganados/perdidos
        </label>
      </div>

      {error && (
        <p className="mb-3 text-sm" style={{ color: "var(--color-aviso)" }}>
          {error}
        </p>
      )}

      {etapas.length === 0 ? (
        <p className="text-sm text-[var(--color-texto-mute)]">
          Todavía no hay etapas configuradas. Ve a la pestaña &ldquo;Etapas&rdquo; para crear el proceso de venta de tu negocio.
        </p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {etapas.map((etapa) => (
              <ColumnaEtapa
                key={etapa.id}
                etapa={etapa}
                deals={dealsFiltrados.filter((d) => d.etapa_id === etapa.id)}
                contactosPorId={contactosPorId}
                perfilesPorId={perfilesPorId}
                puedeGestionar={puedeGestionar}
                onAbrirDeal={onAbrirDeal}
                onNuevoDeal={() => setEtapaNuevoDeal(etapa.id)}
              />
            ))}
          </div>
        </DndContext>
      )}

      {etapaNuevoDeal && (
        <NuevoDealModal
          etapaId={etapaNuevoDeal}
          contactos={contactos}
          perfiles={perfiles}
          onCerrar={() => setEtapaNuevoDeal(null)}
          onCreado={() => {
            setEtapaNuevoDeal(null);
            onRecargar();
          }}
        />
      )}
    </div>
  );
}

function ColumnaEtapa({
  etapa,
  deals,
  contactosPorId,
  perfilesPorId,
  puedeGestionar,
  onAbrirDeal,
  onNuevoDeal,
}: {
  etapa: Etapa;
  deals: Deal[];
  contactosPorId: Map<string, ContactoLite>;
  perfilesPorId: Map<string, PerfilLite>;
  puedeGestionar: boolean;
  onAbrirDeal: (id: string) => void;
  onNuevoDeal: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
  const totalValor = deals.reduce((s, d) => s + Number(d.valor), 0);

  return (
    <div
      ref={setNodeRef}
      className="flex w-72 shrink-0 flex-col rounded-2xl border p-3 transition-colors"
      style={{ borderColor: isOver ? etapa.color : "var(--color-borde)", background: "var(--color-tarjeta)" }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: etapa.color }} />
          <span className="truncate text-sm font-semibold text-[var(--color-texto)]">{etapa.nombre}</span>
          <span className="shrink-0 text-xs text-[var(--color-texto-mute)]">({deals.length})</span>
        </div>
        {puedeGestionar && (
          <button onClick={onNuevoDeal} title="Nuevo deal en esta etapa" className="shrink-0 text-lg leading-none text-[var(--color-marca)]">
            +
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-[var(--color-texto-mute)]">{FORMATO_MONEDA.format(totalValor)}</p>

      <div className="min-h-[40px] flex-1 space-y-2">
        {deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            contacto={deal.contacto_id ? contactosPorId.get(deal.contacto_id) : null}
            propietario={deal.propietario_id ? perfilesPorId.get(deal.propietario_id) : null}
            onClick={() => onAbrirDeal(deal.id)}
          />
        ))}
      </div>
    </div>
  );
}

function DealCard({
  deal,
  contacto,
  propietario,
  onClick,
}: {
  deal: Deal;
  contacto: ContactoLite | null | undefined;
  propietario: PerfilLite | null | undefined;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      style={{ ...style, opacity: isDragging ? 0.5 : 1 }}
      className="cursor-grab touch-none rounded-xl border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] p-3 active:cursor-grabbing"
    >
      <p className="text-sm font-medium text-[var(--color-texto)]">{deal.titulo}</p>
      <p className="mt-0.5 text-xs font-semibold text-[var(--color-marca)]">{FORMATO_MONEDA.format(deal.valor)}</p>
      <p className="mt-1 truncate text-xs text-[var(--color-texto-mute)]">{nombreContacto(contacto)}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="truncate text-xs text-[var(--color-texto-mute)]">{nombrePerfil(propietario)}</span>
        {esDormido(deal) && (
          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: "var(--color-aviso)" }}>
            Dormido
          </span>
        )}
      </div>
    </div>
  );
}

function NuevoDealModal({
  etapaId,
  contactos,
  perfiles,
  onCerrar,
  onCreado,
}: {
  etapaId: string;
  contactos: ContactoLite[];
  perfiles: PerfilLite[];
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [valor, setValor] = useState("");
  const [contactoId, setContactoId] = useState("");
  const [propietarioId, setPropietarioId] = useState("");
  const [fechaCierre, setFechaCierre] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    setEnviando(true);
    setError(null);

    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: titulo.trim(),
        valor: Number(valor) || 0,
        contacto_id: contactoId || null,
        etapa_id: etapaId,
        propietario_id: propietarioId || null,
        fecha_cierre_estimada: fechaCierre || null,
      }),
    });
    setEnviando(false);
    const err = await jsonOError(res);
    if (err) {
      setError(err);
      return;
    }
    onCreado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={crear} className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-texto)]">Nuevo deal</h2>
          <button type="button" onClick={onCerrar} className="text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
            ✕
          </button>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Título</span>
          <input required value={titulo} onChange={(e) => setTitulo(e.target.value)} className={INPUT} placeholder="Ej. Paquete anual — Clínica Sur" />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Valor estimado</span>
          <input type="number" min={0} step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} className={INPUT} placeholder="0.00" />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Contacto</span>
          <select value={contactoId} onChange={(e) => setContactoId(e.target.value)} className={INPUT}>
            <option value="">Sin contacto</option>
            {contactos.map((c) => (
              <option key={c.id} value={c.id}>
                {nombreContacto(c)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Propietario</span>
          <select value={propietarioId} onChange={(e) => setPropietarioId(e.target.value)} className={INPUT}>
            <option value="">Yo (por defecto)</option>
            {perfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre || "Sin nombre"}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Fecha de cierre estimada (opcional)</span>
          <input type="date" value={fechaCierre} onChange={(e) => setFechaCierre(e.target.value)} className={INPUT} />
        </label>

        {error && <p className="text-sm" style={{ color: "var(--color-aviso)" }}>{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-4 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            style={{ boxShadow: "var(--halo-accion)" }}
            className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {enviando ? "Creando…" : "Crear deal"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================
// Panel de detalle de un deal (edición, timeline, comentarios, tareas)
// ============================================================

function DealPanel({
  dealId,
  deals,
  tareas,
  etapas,
  contactos,
  contactosPorId,
  perfiles,
  perfilesPorId,
  puedeGestionar,
  onCerrar,
  onCambiado,
}: {
  dealId: string;
  deals: Deal[];
  tareas: Tarea[];
  etapas: Etapa[];
  contactos: ContactoLite[];
  contactosPorId: Map<string, ContactoLite>;
  perfiles: PerfilLite[];
  perfilesPorId: Map<string, PerfilLite>;
  puedeGestionar: boolean;
  onCerrar: () => void;
  onCambiado: () => void;
}) {
  const deal = deals.find((d) => d.id === dealId);
  const [subtab, setSubtab] = useState<"detalle" | "actividad">("detalle");
  const [eventos, setEventos] = useState<EventoTimeline[]>([]);
  const [cargandoTimeline, setCargandoTimeline] = useState(true);
  const [comentario, setComentario] = useState("");
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [mostrarCierre, setMostrarCierre] = useState<"ganado" | "perdido" | null>(null);
  const [mostrarNuevaTarea, setMostrarNuevaTarea] = useState(false);
  const [guardandoCampo, setGuardandoCampo] = useState(false);

  async function cargarTimeline() {
    setCargandoTimeline(true);
    const res = await fetch(`/api/deals/${dealId}/timeline`);
    const data = await res.json();
    setEventos(data.eventos ?? []);
    setCargandoTimeline(false);
  }

  useEffect(() => {
    cargarTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  if (!deal) return null;

  async function guardarCampo(cambios: Record<string, unknown>) {
    setGuardandoCampo(true);
    await fetch(`/api/deals/${dealId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambios) });
    setGuardandoCampo(false);
    onCambiado();
  }

  async function asignar(propietarioId: string) {
    await fetch(`/api/deals/${dealId}/asignar`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propietario_id: propietarioId || null }),
    });
    onCambiado();
    cargarTimeline();
  }

  async function enviarComentario() {
    if (!comentario.trim()) return;
    setEnviandoComentario(true);
    await fetch(`/api/deals/${dealId}/comentarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: comentario.trim() }),
    });
    setComentario("");
    setEnviandoComentario(false);
    cargarTimeline();
  }

  async function eliminarDeal() {
    if (!confirm("¿Eliminar este deal? Esta acción no se puede deshacer.")) return;
    await fetch(`/api/deals/${dealId}`, { method: "DELETE" });
    onCambiado();
    onCerrar();
  }

  const tareasDelDeal = tareas.filter((t) => t.deal_id === dealId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-borde)] p-5">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-[var(--color-texto)]">{deal.titulo}</h2>
            <p className="mt-0.5 text-xs text-[var(--color-texto-mute)]">
              {deal.estado === "abierto" ? "Abierto" : deal.estado === "ganado" ? "Ganado" : "Perdido"} · {FORMATO_MONEDA.format(deal.valor)}
            </p>
          </div>
          <button onClick={onCerrar} className="shrink-0 text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
            ✕
          </button>
        </div>

        <div className="flex gap-4 border-b border-[var(--color-borde)] px-5">
          {(
            [
              ["detalle", "Detalle"],
              ["actividad", "Actividad"],
            ] as [typeof subtab, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setSubtab(v)}
              className="border-b-2 pb-2 pt-3 text-sm font-medium"
              style={{ borderColor: subtab === v ? "var(--color-marca)" : "transparent", color: subtab === v ? "var(--color-texto)" : "var(--color-texto-mute)" }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {subtab === "detalle" ? (
            <div className="space-y-5">
              {puedeGestionar ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Valor</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={deal.valor}
                      onBlur={(e) => guardarCampo({ valor: Number(e.target.value) || 0 })}
                      className={INPUT}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Contacto</span>
                    <select defaultValue={deal.contacto_id ?? ""} onChange={(e) => guardarCampo({ contacto_id: e.target.value || null })} className={INPUT}>
                      <option value="">Sin contacto</option>
                      {contactos.map((c) => (
                        <option key={c.id} value={c.id}>
                          {nombreContacto(c)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Propietario</span>
                    <select defaultValue={deal.propietario_id ?? ""} onChange={(e) => asignar(e.target.value)} className={INPUT}>
                      <option value="">Sin asignar</option>
                      {perfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre || "Sin nombre"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Fecha de cierre estimada</span>
                    <input
                      type="date"
                      defaultValue={deal.fecha_cierre_estimada ?? ""}
                      onChange={(e) => guardarCampo({ fecha_cierre_estimada: e.target.value || null })}
                      className={INPUT}
                    />
                  </label>
                </div>
              ) : (
                <div className="grid gap-2 text-sm text-[var(--color-texto)] sm:grid-cols-2">
                  <p>Contacto: {nombreContacto(deal.contacto_id ? contactosPorId.get(deal.contacto_id) : null)}</p>
                  <p>Propietario: {nombrePerfil(deal.propietario_id ? perfilesPorId.get(deal.propietario_id) : null)}</p>
                </div>
              )}
              {guardandoCampo && <p className="text-xs text-[var(--color-texto-mute)]">Guardando…</p>}

              {deal.estado !== "abierto" && deal.motivo_cierre && (
                <p className="rounded-lg bg-[var(--color-bg-elevada)] p-3 text-sm text-[var(--color-texto-mute)]">
                  Motivo de cierre: {deal.motivo_cierre}
                </p>
              )}

              {puedeGestionar && deal.estado === "abierto" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setMostrarCierre("ganado")}
                    className="rounded-lg border border-[var(--color-borde)] px-3 py-1.5 text-sm font-medium text-[var(--color-texto)] hover:opacity-80"
                    style={{ background: "color-mix(in srgb, #22c55e 15%, transparent)" }}
                  >
                    Marcar ganado
                  </button>
                  <button
                    onClick={() => setMostrarCierre("perdido")}
                    className="rounded-lg border border-[var(--color-borde)] px-3 py-1.5 text-sm font-medium text-[var(--color-texto)] hover:opacity-80"
                    style={{ background: "color-mix(in srgb, #ef4444 15%, transparent)" }}
                  >
                    Marcar perdido
                  </button>
                </div>
              )}

              <div className="border-t border-[var(--color-borde)] pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--color-texto)]">Tareas</span>
                  {puedeGestionar && (
                    <button onClick={() => setMostrarNuevaTarea(true)} className="text-xs font-medium text-[var(--color-marca)] hover:underline">
                      + Nueva tarea
                    </button>
                  )}
                </div>
                {tareasDelDeal.length === 0 ? (
                  <p className="text-xs text-[var(--color-texto-mute)]">Sin tareas para este deal.</p>
                ) : (
                  <div className="space-y-1.5">
                    {tareasDelDeal.map((t) => (
                      <TareaFila key={t.id} tarea={t} perfilesPorId={perfilesPorId} puedeGestionar={puedeGestionar} onCambiado={onCambiado} />
                    ))}
                  </div>
                )}
              </div>

              {puedeGestionar && (
                <div className="border-t border-[var(--color-borde)] pt-4">
                  <button onClick={eliminarDeal} className="text-sm font-medium text-red-500 hover:underline">
                    Eliminar deal
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {puedeGestionar && (
                <div className="flex gap-2">
                  <input
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    placeholder="Escribe una nota para el equipo…"
                    className={INPUT}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") enviarComentario();
                    }}
                  />
                  <button
                    onClick={enviarComentario}
                    disabled={enviandoComentario || !comentario.trim()}
                    className="shrink-0 rounded-lg bg-[var(--color-accion)] px-3 py-2 text-sm font-semibold text-[var(--color-accion-fg)] disabled:opacity-50"
                  >
                    Enviar
                  </button>
                </div>
              )}

              {cargandoTimeline ? (
                <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
              ) : eventos.length === 0 ? (
                <p className="text-sm text-[var(--color-texto-mute)]">Todavía no hay actividad en este deal.</p>
              ) : (
                <div className="space-y-3">
                  {[...eventos].reverse().map((ev) => (
                    <div key={ev.id} className="rounded-lg border border-[var(--color-borde)] p-3">
                      <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-texto-mute)]">
                        <span className="font-medium text-[var(--color-texto)]">{nombreDePerfilEnEvento(ev)}</span>
                        <span>{new Date(ev.created_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--color-texto)]">
                        {ev.accion === "comment_deal" ? String(ev.detalles?.texto ?? "") : LABEL_ACCION[ev.accion] ?? ev.accion}
                      </p>
                      {ev.accion === "move_deal_stage" && (
                        <p className="mt-0.5 text-xs text-[var(--color-texto-mute)]">
                          {String(ev.detalles?.etapa_origen ?? "?")} → {String(ev.detalles?.etapa_destino ?? "?")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {mostrarCierre && (
        <CerrarDealModal
          estado={mostrarCierre}
          valorActual={deal.valor}
          onCerrar={() => setMostrarCierre(null)}
          onConfirmado={() => {
            setMostrarCierre(null);
            onCambiado();
            cargarTimeline();
          }}
          dealId={dealId}
        />
      )}

      {mostrarNuevaTarea && (
        <NuevaTareaModal
          dealId={dealId}
          perfiles={perfiles}
          onCerrar={() => setMostrarNuevaTarea(false)}
          onCreada={() => {
            setMostrarNuevaTarea(false);
            onCambiado();
          }}
        />
      )}
    </div>
  );
}

function CerrarDealModal({
  dealId,
  estado,
  valorActual,
  onCerrar,
  onConfirmado,
}: {
  dealId: string;
  estado: "ganado" | "perdido";
  valorActual: number;
  onCerrar: () => void;
  onConfirmado: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [valorFinal, setValorFinal] = useState(String(valorActual));
  const [ajustarValor, setAjustarValor] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    await fetch(`/api/deals/${dealId}/cerrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        estado,
        motivo_cierre: motivo.trim() || null,
        valor_final: ajustarValor ? Number(valorFinal) || 0 : undefined,
      }),
    });
    setEnviando(false);
    onConfirmado();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={confirmar} className="w-full max-w-sm space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <h2 className="text-base font-semibold text-[var(--color-texto)]">Marcar como {estado === "ganado" ? "ganado" : "perdido"}</h2>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Razón de cierre (opcional)</span>
          <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={INPUT} placeholder={estado === "ganado" ? "Ej. cerró por precio y tiempo de entrega" : "Ej. eligió a la competencia"} />
        </label>

        <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-texto)]">
          <input type="checkbox" checked={ajustarValor} onChange={(e) => setAjustarValor(e.target.checked)} />
          Ajustar el monto final (opcional)
        </label>
        {ajustarValor && (
          <input type="number" min={0} step="0.01" value={valorFinal} onChange={(e) => setValorFinal(e.target.value)} className={INPUT} />
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-4 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            style={{ boxShadow: "var(--halo-accion)" }}
            className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {enviando ? "Guardando…" : "Confirmar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TareaFila({
  tarea,
  perfilesPorId,
  puedeGestionar,
  onCambiado,
}: {
  tarea: Tarea;
  perfilesPorId: Map<string, PerfilLite>;
  puedeGestionar: boolean;
  onCambiado: () => void;
}) {
  const vencida = !tarea.completada && new Date(tarea.fecha_vencimiento).getTime() < Date.now();

  async function alternar() {
    await fetch(`/api/tareas/${tarea.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completada: !tarea.completada }),
    });
    onCambiado();
  }

  async function eliminar() {
    await fetch(`/api/tareas/${tarea.id}`, { method: "DELETE" });
    onCambiado();
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-borde)] px-3 py-2 text-sm">
      <label className="flex min-w-0 items-center gap-2">
        <input type="checkbox" checked={tarea.completada} onChange={alternar} disabled={!puedeGestionar} />
        <span className={`truncate ${tarea.completada ? "text-[var(--color-texto-mute)] line-through" : "text-[var(--color-texto)]"}`}>
          {LABEL_TIPO_TAREA[tarea.tipo]}: {tarea.titulo}
        </span>
      </label>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs" style={{ color: vencida ? "var(--color-aviso)" : "var(--color-texto-mute)" }}>
          {new Date(tarea.fecha_vencimiento).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
        </span>
        <span className="text-xs text-[var(--color-texto-mute)]">{nombrePerfil(tarea.asignado_a ? perfilesPorId.get(tarea.asignado_a) : null)}</span>
        {puedeGestionar && (
          <button onClick={eliminar} className="text-xs font-medium text-red-500 hover:underline">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function NuevaTareaModal({
  dealId,
  perfiles,
  onCerrar,
  onCreada,
}: {
  dealId: string;
  perfiles: PerfilLite[];
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const [tipo, setTipo] = useState<Tarea["tipo"]>("llamada");
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState("");
  const [asignadoA, setAsignadoA] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !fecha) return;
    setEnviando(true);
    setError(null);

    const res = await fetch("/api/tareas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deal_id: dealId, tipo, titulo: titulo.trim(), fecha_vencimiento: new Date(fecha).toISOString(), asignado_a: asignadoA || null }),
    });
    setEnviando(false);
    const err = await jsonOError(res);
    if (err) {
      setError(err);
      return;
    }
    onCreada();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={crear} className="w-full max-w-sm space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <h2 className="text-base font-semibold text-[var(--color-texto)]">Nueva tarea</h2>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as Tarea["tipo"])} className={INPUT}>
            <option value="llamada">Llamada</option>
            <option value="email">Correo</option>
            <option value="reunion">Reunión</option>
            <option value="otro">Otro</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Título</span>
          <input required value={titulo} onChange={(e) => setTitulo(e.target.value)} className={INPUT} />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Fecha y hora de vencimiento</span>
          <input required type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className={INPUT} />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Asignado a</span>
          <select value={asignadoA} onChange={(e) => setAsignadoA(e.target.value)} className={INPUT}>
            <option value="">Yo (por defecto)</option>
            {perfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre || "Sin nombre"}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="text-sm" style={{ color: "var(--color-aviso)" }}>{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-4 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            style={{ boxShadow: "var(--halo-accion)" }}
            className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {enviando ? "Creando…" : "Crear tarea"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================
// Etapas
// ============================================================

function EtapasTab({
  etapas,
  deals,
  puedeConfigurar,
  onRecargar,
}: {
  etapas: Etapa[];
  deals: Deal[];
  puedeConfigurar: boolean;
  onRecargar: () => void;
}) {
  const [editando, setEditando] = useState<Etapa | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarSugerir, setMostrarSugerir] = useState(false);

  async function mover(etapa: Etapa, direccion: -1 | 1) {
    const idx = etapas.findIndex((e) => e.id === etapa.id);
    const vecino = etapas[idx + direccion];
    if (!vecino) return;
    await Promise.all([
      fetch(`/api/pipeline/etapas/${etapa.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orden: vecino.orden }) }),
      fetch(`/api/pipeline/etapas/${vecino.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orden: etapa.orden }) }),
    ]);
    onRecargar();
  }

  async function eliminar(etapa: Etapa) {
    if (!confirm(`¿Eliminar la etapa "${etapa.nombre}"?`)) return;
    const res = await fetch(`/api/pipeline/etapas/${etapa.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "No se pudo eliminar");
      return;
    }
    onRecargar();
  }

  return (
    <div className="max-w-2xl">
      {puedeConfigurar && (
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => {
              setEditando(null);
              setMostrarForm((v) => !v);
            }}
            style={{ boxShadow: "var(--halo-accion)" }}
            className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
          >
            {mostrarForm && !editando ? "Cancelar" : "Nueva etapa"}
          </button>
          <button
            onClick={() => setMostrarSugerir(true)}
            className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-4 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80"
          >
            ✨ Sugerir etapas con IA
          </button>
        </div>
      )}

      {(mostrarForm || editando) && puedeConfigurar && (
        <FormularioEtapa
          etapa={editando}
          siguienteOrden={etapas.length}
          onGuardado={() => {
            setMostrarForm(false);
            setEditando(null);
            onRecargar();
          }}
          onCancelar={() => {
            setMostrarForm(false);
            setEditando(null);
          }}
        />
      )}

      <div className="mt-4 space-y-2">
        {etapas.length === 0 ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Todavía no hay etapas.</p>
        ) : (
          etapas.map((etapa, idx) => {
            const conteo = deals.filter((d) => d.etapa_id === etapa.id).length;
            return (
              <div key={etapa.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: etapa.color }} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-texto)]">
                      {etapa.nombre}
                      {etapa.es_ganada && <span className="ml-2 text-xs text-[var(--color-texto-mute)]">(ganada)</span>}
                      {etapa.es_perdida && <span className="ml-2 text-xs text-[var(--color-texto-mute)]">(perdida)</span>}
                    </p>
                    <p className="text-xs text-[var(--color-texto-mute)]">
                      {conteo} deal{conteo !== 1 && "s"} · probabilidad por defecto: {etapa.probabilidad_default}%
                    </p>
                  </div>
                </div>
                {puedeConfigurar && (
                  <div className="flex shrink-0 items-center gap-3">
                    <button onClick={() => mover(etapa, -1)} disabled={idx === 0} className="text-[var(--color-texto-mute)] hover:text-[var(--color-texto)] disabled:opacity-30" title="Subir">
                      ↑
                    </button>
                    <button onClick={() => mover(etapa, 1)} disabled={idx === etapas.length - 1} className="text-[var(--color-texto-mute)] hover:text-[var(--color-texto)] disabled:opacity-30" title="Bajar">
                      ↓
                    </button>
                    <button
                      onClick={() => {
                        setMostrarForm(false);
                        setEditando(etapa);
                      }}
                      className="text-sm font-medium text-[var(--color-marca)] hover:underline"
                    >
                      Editar
                    </button>
                    <button onClick={() => eliminar(etapa)} className="text-sm font-medium text-red-500 hover:underline">
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {mostrarSugerir && (
        <SugerirEtapasModal
          siguienteOrden={etapas.length}
          onCerrar={() => setMostrarSugerir(false)}
          onCreadas={() => {
            setMostrarSugerir(false);
            onRecargar();
          }}
        />
      )}
    </div>
  );
}

function FormularioEtapa({
  etapa,
  siguienteOrden,
  onGuardado,
  onCancelar,
}: {
  etapa: Etapa | null;
  siguienteOrden: number;
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(etapa?.nombre ?? "");
  const [color, setColor] = useState(etapa?.color ?? COLORES_PRESET[0]);
  const [probabilidad, setProbabilidad] = useState(etapa?.probabilidad_default ?? 20);
  const [esGanada, setEsGanada] = useState(etapa?.es_ganada ?? false);
  const [esPerdida, setEsPerdida] = useState(etapa?.es_perdida ?? false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setEnviando(true);
    setError(null);

    const payload = { nombre: nombre.trim(), color, probabilidad_default: probabilidad, es_ganada: esGanada, es_perdida: esPerdida, orden: etapa?.orden ?? siguienteOrden };
    const res = etapa
      ? await fetch(`/api/pipeline/etapas/${etapa.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch("/api/pipeline/etapas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    setEnviando(false);
    const err = await jsonOError(res);
    if (err) {
      setError(err);
      return;
    }
    onGuardado();
  }

  return (
    <form onSubmit={guardar} className="mb-4 space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nombre</span>
        <input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT} placeholder="Ej. Propuesta enviada" />
      </label>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Color</span>
        <div className="flex flex-wrap items-center gap-2">
          {COLORES_PRESET.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="h-7 w-7 rounded-full"
              style={{ background: c, outline: color === c ? "2px solid var(--color-texto)" : "none", outlineOffset: 2 }}
            />
          ))}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-[var(--color-borde)] bg-transparent" />
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Probabilidad por defecto de cerrar ganado (%)</span>
        <input type="number" min={0} max={100} value={probabilidad} onChange={(e) => setProbabilidad(Number(e.target.value))} className={INPUT} />
      </label>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-texto)]">
          <input type="checkbox" checked={esGanada} onChange={(e) => setEsGanada(e.target.checked)} />
          Es la etapa de "ganado"
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-texto)]">
          <input type="checkbox" checked={esPerdida} onChange={(e) => setEsPerdida(e.target.checked)} />
          Es la etapa de "perdido"
        </label>
      </div>

      {error && <p className="text-sm" style={{ color: "var(--color-aviso)" }}>{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={enviando}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {enviando ? "Guardando…" : etapa ? "Guardar cambios" : "Crear etapa"}
        </button>
        <button type="button" onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function SugerirEtapasModal({
  siguienteOrden,
  onCerrar,
  onCreadas,
}: {
  siguienteOrden: number;
  onCerrar: () => void;
  onCreadas: () => void;
}) {
  const [rubro, setRubro] = useState("");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sugerencias, setSugerencias] = useState<{ nombre: string; color: string; probabilidad_default: number; es_ganada: boolean; es_perdida: boolean }[] | null>(null);
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set());
  const [creando, setCreando] = useState(false);

  async function generar(e: FormEvent) {
    e.preventDefault();
    if (!rubro.trim()) return;
    setGenerando(true);
    setError(null);

    const res = await fetch("/api/pipeline/etapas/sugerir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rubro: rubro.trim() }) });
    const data = await res.json();
    setGenerando(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo generar");
      return;
    }
    setSugerencias(data.sugerencias);
    setSeleccionadas(new Set(data.sugerencias.map((_: unknown, i: number) => i)));
  }

  async function crearSeleccionadas() {
    if (!sugerencias) return;
    setCreando(true);
    const aCrear = sugerencias.filter((_, i) => seleccionadas.has(i));
    for (let i = 0; i < aCrear.length; i++) {
      await fetch("/api/pipeline/etapas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...aCrear[i], orden: siguienteOrden + i }),
      });
    }
    setCreando(false);
    onCreadas();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-texto)]">Sugerir etapas con IA</h2>
          <button onClick={onCerrar} className="text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
            ✕
          </button>
        </div>

        {!sugerencias ? (
          <form onSubmit={generar} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">¿A qué se dedica el negocio?</span>
              <input required value={rubro} onChange={(e) => setRubro(e.target.value)} className={INPUT} placeholder="Clínica dental, despacho legal, agencia de marketing…" />
            </label>
            {error && <p className="text-sm" style={{ color: "var(--color-aviso)" }}>{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onCerrar} className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-4 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={generando}
                style={{ boxShadow: "var(--halo-accion)" }}
                className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {generando ? "Generando…" : "Generar"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              {sugerencias.map((s, i) => (
                <label key={i} className="flex items-center gap-2 rounded-lg border border-[var(--color-borde)] p-2 text-sm">
                  <input
                    type="checkbox"
                    checked={seleccionadas.has(i)}
                    onChange={() =>
                      setSeleccionadas((prev) => {
                        const nuevo = new Set(prev);
                        if (nuevo.has(i)) nuevo.delete(i);
                        else nuevo.add(i);
                        return nuevo;
                      })
                    }
                  />
                  <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
                  <span className="text-[var(--color-texto)]">{s.nombre}</span>
                  <span className="ml-auto text-xs text-[var(--color-texto-mute)]">{s.probabilidad_default}%</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setSugerencias(null)} className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-4 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80">
                Volver
              </button>
              <button
                onClick={crearSeleccionadas}
                disabled={creando || seleccionadas.size === 0}
                style={{ boxShadow: "var(--halo-accion)" }}
                className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {creando ? "Creando…" : `Crear ${seleccionadas.size} etapa(s)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Tareas (todas las de la cuenta)
// ============================================================

function TareasTab({
  tareas,
  deals,
  perfiles,
  perfilId,
  puedeGestionar,
  onAbrirDeal,
  onRecargar,
}: {
  tareas: Tarea[];
  deals: Deal[];
  perfiles: PerfilLite[];
  perfilId: string;
  puedeGestionar: boolean;
  onAbrirDeal: (id: string) => void;
  onRecargar: () => void;
}) {
  const [filtro, setFiltro] = useState<"pendientes" | "completadas" | "vencidas" | "todas">("pendientes");
  const [filtroAsignado, setFiltroAsignado] = useState("");

  const dealsPorId = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);
  const perfilesPorId = useMemo(() => new Map(perfiles.map((p) => [p.id, p])), [perfiles]);

  const filtradas = useMemo(() => {
    const ahora = Date.now();
    return tareas.filter((t) => {
      if (filtroAsignado && t.asignado_a !== filtroAsignado) return false;
      if (filtro === "pendientes") return !t.completada;
      if (filtro === "completadas") return t.completada;
      if (filtro === "vencidas") return !t.completada && new Date(t.fecha_vencimiento).getTime() < ahora;
      return true;
    });
  }, [tareas, filtro, filtroAsignado]);

  async function alternar(id: string, completada: boolean) {
    await fetch(`/api/tareas/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completada }) });
    onRecargar();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className={`${INPUT} max-w-[180px]`}>
          <option value="pendientes">Pendientes</option>
          <option value="vencidas">Vencidas</option>
          <option value="completadas">Completadas</option>
          <option value="todas">Todas</option>
        </select>
        <select value={filtroAsignado} onChange={(e) => setFiltroAsignado(e.target.value)} className={`${INPUT} max-w-[180px]`}>
          <option value="">Todos los asignados</option>
          <option value={perfilId}>Asignadas a mí</option>
          {perfiles.filter((p) => p.id !== perfilId).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre || "Sin nombre"}
            </option>
          ))}
        </select>
      </div>

      {filtradas.length === 0 ? (
        <p className="text-sm text-[var(--color-texto-mute)]">No hay tareas para este filtro.</p>
      ) : (
        <div className="space-y-2">
          {filtradas.map((t) => {
            const deal = dealsPorId.get(t.deal_id);
            const vencida = !t.completada && new Date(t.fecha_vencimiento).getTime() < Date.now();
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-4">
                <label className="flex min-w-0 items-center gap-3">
                  <input type="checkbox" checked={t.completada} disabled={!puedeGestionar} onChange={(e) => alternar(t.id, e.target.checked)} />
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-medium ${t.completada ? "text-[var(--color-texto-mute)] line-through" : "text-[var(--color-texto)]"}`}>
                      {LABEL_TIPO_TAREA[t.tipo]}: {t.titulo}
                    </p>
                    {deal && (
                      <button type="button" onClick={() => onAbrirDeal(deal.id)} className="text-xs text-[var(--color-marca)] hover:underline">
                        {deal.titulo}
                      </button>
                    )}
                  </div>
                </label>
                <div className="shrink-0 text-right">
                  <p className="text-xs" style={{ color: vencida ? "var(--color-aviso)" : "var(--color-texto-mute)" }}>
                    {new Date(t.fecha_vencimiento).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-xs text-[var(--color-texto-mute)]">{nombrePerfil(t.asignado_a ? perfilesPorId.get(t.asignado_a) : null)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Estadísticas / forecast / alertas
// ============================================================

function EstadisticasTab({
  etapas,
  deals,
  tareas,
  etapasPorId,
}: {
  etapas: Etapa[];
  deals: Deal[];
  tareas: Tarea[];
  etapasPorId: Map<string, Etapa>;
}) {
  const abiertos = deals.filter((d) => d.estado === "abierto");
  const totalPipeline = abiertos.reduce((s, d) => s + Number(d.valor), 0);
  const valorPonderado = abiertos.reduce((s, d) => s + (Number(d.valor) * probabilidadEfectiva(d, etapasPorId)) / 100, 0);

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const cerradosEsteMes = deals.filter((d) => d.estado !== "abierto" && new Date(d.ultima_actividad_en) >= inicioMes);
  const ganadosMes = cerradosEsteMes.filter((d) => d.estado === "ganado");
  const perdidosMes = cerradosEsteMes.filter((d) => d.estado === "perdido");
  const tasaConversion = cerradosEsteMes.length > 0 ? Math.round((ganadosMes.length / cerradosEsteMes.length) * 100) : null;

  const dealsDormidos = abiertos.filter(esDormido);
  const ahora = Date.now();
  const tareasPorVencer = tareas.filter((t) => !t.completada && new Date(t.fecha_vencimiento).getTime() < ahora + 48 * 60 * 60 * 1000);

  const maxValorEtapa = Math.max(1, ...etapas.map((e) => abiertos.filter((d) => d.etapa_id === e.id).reduce((s, d) => s + Number(d.valor), 0)));

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { etiqueta: "Pipeline total (abierto)", valor: FORMATO_MONEDA.format(totalPipeline) },
          { etiqueta: "Valor ponderado", valor: FORMATO_MONEDA.format(valorPonderado) },
          { etiqueta: "Deals abiertos", valor: String(abiertos.length) },
          { etiqueta: "Tasa de conversión (mes)", valor: tasaConversion === null ? "—" : `${tasaConversion}%` },
        ].map((t) => (
          <div key={t.etiqueta} className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
            <p className="text-sm text-[var(--color-texto-mute)]">{t.etiqueta}</p>
            <p className="mt-2 text-2xl font-bold text-[var(--color-texto)]">{t.valor}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
          <p className="text-sm text-[var(--color-texto-mute)]">Ganados este mes</p>
          <p className="mt-2 text-2xl font-bold text-[var(--color-texto)]">
            {ganadosMes.length} <span className="text-sm font-normal text-[var(--color-texto-mute)]">({FORMATO_MONEDA.format(ganadosMes.reduce((s, d) => s + Number(d.valor), 0))})</span>
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
          <p className="text-sm text-[var(--color-texto-mute)]">Perdidos este mes</p>
          <p className="mt-2 text-2xl font-bold text-[var(--color-texto)]">{perdidosMes.length}</p>
        </div>
      </div>

      {etapas.length > 0 && (
        <div className="mt-6 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
          <h3 className="mb-3 text-sm font-semibold text-[var(--color-texto)]">Valor abierto por etapa</h3>
          <div className="space-y-2">
            {etapas.map((etapa) => {
              const valorEtapa = abiertos.filter((d) => d.etapa_id === etapa.id).reduce((s, d) => s + Number(d.valor), 0);
              return (
                <div key={etapa.id} className="flex items-center gap-3 text-xs">
                  <span className="w-28 shrink-0 truncate text-[var(--color-texto-mute)]">{etapa.nombre}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-elevada)]">
                    <div className="h-full rounded-full" style={{ width: `${(valorEtapa / maxValorEtapa) * 100}%`, background: etapa.color }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-[var(--color-texto)]">{FORMATO_MONEDA.format(valorEtapa)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
          <h3 className="mb-3 text-sm font-semibold text-[var(--color-texto)]">
            Deals dormidos <span className="font-normal text-[var(--color-texto-mute)]">(sin actividad hace {UMBRAL_DORMIDO_DIAS}+ días)</span>
          </h3>
          {dealsDormidos.length === 0 ? (
            <p className="text-sm text-[var(--color-texto-mute)]">Ninguno -- todo al día.</p>
          ) : (
            <ul className="space-y-1.5 text-sm text-[var(--color-texto)]">
              {dealsDormidos.map((d) => (
                <li key={d.id} className="flex justify-between gap-2">
                  <span className="truncate">{d.titulo}</span>
                  <span className="shrink-0 text-[var(--color-texto-mute)]">{FORMATO_MONEDA.format(d.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
          <h3 className="mb-3 text-sm font-semibold text-[var(--color-texto)]">Tareas por vencer o vencidas</h3>
          {tareasPorVencer.length === 0 ? (
            <p className="text-sm text-[var(--color-texto-mute)]">Ninguna -- todo al día.</p>
          ) : (
            <ul className="space-y-1.5 text-sm text-[var(--color-texto)]">
              {tareasPorVencer.map((t) => (
                <li key={t.id} className="flex justify-between gap-2">
                  <span className="truncate">{t.titulo}</span>
                  <span className="shrink-0 text-[var(--color-texto-mute)]">{new Date(t.fecha_vencimiento).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
