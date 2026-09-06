"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type EntidadReporte = "contactos" | "deals" | "campanas";
type DimensionReporte = "etapa_pipeline" | "etiqueta" | "asignado_a" | "canal_origen" | "status" | "fecha_creacion" | "fecha_modificacion";
type TipoGraficoReporte = "barras" | "dona" | "linea" | "numero";
type AgruparFechaPor = "dia" | "semana" | "mes";

type Reporte = {
  id: string;
  nombre: string;
  entidad: EntidadReporte;
  dimension: DimensionReporte;
  tipo_grafico: TipoGraficoReporte;
  agrupar_fecha_por: AgruparFechaPor | null;
  filtros: { rango_dias?: number | null };
};

type PuntoDato = { etiqueta: string; valor: number };
type Preferencia = { reporte_id: string; orden: number };

const DIMENSIONES_POR_ENTIDAD: Record<EntidadReporte, { valor: DimensionReporte; etiqueta: string }[]> = {
  contactos: [
    { valor: "etiqueta", etiqueta: "Etiqueta" },
    { valor: "asignado_a", etiqueta: "Usuario asignado" },
    { valor: "canal_origen", etiqueta: "Canal de origen" },
    { valor: "status", etiqueta: "Estado" },
    { valor: "fecha_creacion", etiqueta: "Fecha de creación" },
    { valor: "fecha_modificacion", etiqueta: "Fecha de modificación" },
  ],
  deals: [
    { valor: "etapa_pipeline", etiqueta: "Etapa de pipeline" },
    { valor: "asignado_a", etiqueta: "Usuario asignado" },
    { valor: "status", etiqueta: "Estado" },
    { valor: "fecha_creacion", etiqueta: "Fecha de creación" },
    { valor: "fecha_modificacion", etiqueta: "Fecha de modificación" },
  ],
  campanas: [
    { valor: "status", etiqueta: "Estado" },
    { valor: "fecha_creacion", etiqueta: "Fecha de creación" },
    { valor: "fecha_modificacion", etiqueta: "Fecha de modificación" },
  ],
};

const ETIQUETA_ENTIDAD: Record<EntidadReporte, string> = { contactos: "Contactos", deals: "Deals", campanas: "Campañas" };
const COLORES = ["#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899", "#14b8a6", "#a855f7"];

const INPUT_LOCAL =
  "w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]";

export function ReportesDashboard({ permisos }: { permisos: Record<string, boolean> }) {
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [preferencias, setPreferencias] = useState<Preferencia[]>([]);
  const [datos, setDatos] = useState<Record<string, PuntoDato[]>>({});
  const [cargando, setCargando] = useState(true);
  const [mostrarSelector, setMostrarSelector] = useState(false);
  const [editando, setEditando] = useState<Reporte | "nueva" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    const [resReportes, resPreferencias] = await Promise.all([
      fetch("/api/reportes").then((r) => r.json()),
      fetch("/api/reportes/preferencias").then((r) => r.json()),
    ]);
    setReportes(resReportes.reportes ?? []);
    setPreferencias(resPreferencias.preferencias ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const visibles = useMemo(() => {
    const mapaReportes = new Map(reportes.map((r) => [r.id, r]));
    return preferencias
      .map((p) => ({ orden: p.orden, reporte: mapaReportes.get(p.reporte_id) }))
      .filter((x): x is { orden: number; reporte: Reporte } => !!x.reporte)
      .sort((a, b) => a.orden - b.orden)
      .map((x) => x.reporte);
  }, [reportes, preferencias]);

  useEffect(() => {
    for (const r of visibles) {
      if (datos[r.id]) continue;
      fetch(`/api/reportes/${r.id}/datos`)
        .then((res) => res.json())
        .then((data) => setDatos((prev) => ({ ...prev, [r.id]: data.datos ?? [] })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibles]);

  async function guardarPreferencias(nuevas: Preferencia[]) {
    setPreferencias(nuevas);
    await fetch("/api/reportes/preferencias", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferencias: nuevas }),
    });
  }

  function agregarAlDashboard(reporteId: string) {
    const maxOrden = preferencias.reduce((m, p) => Math.max(m, p.orden), -1);
    guardarPreferencias([...preferencias, { reporte_id: reporteId, orden: maxOrden + 1 }]);
    setMostrarSelector(false);
  }

  function quitarDelDashboard(reporteId: string) {
    guardarPreferencias(preferencias.filter((p) => p.reporte_id !== reporteId));
  }

  function mover(reporteId: string, direccion: -1 | 1) {
    const orden = [...visibles];
    const idx = orden.findIndex((r) => r.id === reporteId);
    const destino = idx + direccion;
    if (destino < 0 || destino >= orden.length) return;
    [orden[idx], orden[destino]] = [orden[destino], orden[idx]];
    guardarPreferencias(orden.map((r, i) => ({ reporte_id: r.id, orden: i })));
  }

  async function eliminarReporte(id: string) {
    if (!confirm("¿Eliminar este reporte para toda la cuenta?")) return;
    setError(null);
    const res = await fetch(`/api/reportes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo eliminar");
      return;
    }
    cargar();
  }

  const disponiblesParaAgregar = reportes.filter((r) => !preferencias.some((p) => p.reporte_id === r.id));

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--color-texto)]">Reportes</h2>
        <div className="relative">
          <button
            onClick={() => setMostrarSelector((v) => !v)}
            className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-1.5 text-sm font-medium text-[var(--color-texto)] hover:opacity-80"
          >
            Agregar reporte
          </button>
          {mostrarSelector && (
            <div className="absolute right-0 z-10 mt-2 w-64 rounded-xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-2 shadow-lg">
              {disponiblesParaAgregar.length === 0 ? (
                <p className="p-2 text-xs text-[var(--color-texto-mute)]">No hay más reportes por agregar.</p>
              ) : (
                disponiblesParaAgregar.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => agregarAlDashboard(r.id)}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-[var(--color-texto)] hover:bg-[var(--color-bg-elevada)]"
                  >
                    {r.nombre}
                  </button>
                ))
              )}
              {permisos.manage_reportes && (
                <button
                  onClick={() => {
                    setMostrarSelector(false);
                    setEditando("nueva");
                  }}
                  className="mt-1 block w-full rounded-lg border-t border-[var(--color-borde)] px-2 py-1.5 text-left text-sm font-medium text-[var(--color-marca)] hover:bg-[var(--color-bg-elevada)]"
                >
                  + Crear nuevo reporte
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      {editando && (
        <FormularioReporte
          reporte={editando === "nueva" ? null : editando}
          onGuardado={(nuevo, esNuevo) => {
            setEditando(null);
            if (esNuevo) agregarAlDashboard(nuevo.id);
            cargar();
          }}
          onCancelar={() => setEditando(null)}
        />
      )}

      {cargando ? (
        <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-[var(--color-texto-mute)]">Todavía no tienes reportes en tu dashboard.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((r, i) => (
            <TarjetaReporte
              key={r.id}
              reporte={r}
              datos={datos[r.id]}
              puedeEditar={!!permisos.manage_reportes}
              puedeSubir={i > 0}
              puedeBajar={i < visibles.length - 1}
              onSubir={() => mover(r.id, -1)}
              onBajar={() => mover(r.id, 1)}
              onQuitar={() => quitarDelDashboard(r.id)}
              onEditar={() => setEditando(r)}
              onEliminar={() => eliminarReporte(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TarjetaReporte({
  reporte,
  datos,
  puedeEditar,
  puedeSubir,
  puedeBajar,
  onSubir,
  onBajar,
  onQuitar,
  onEditar,
  onEliminar,
}: {
  reporte: Reporte;
  datos?: PuntoDato[];
  puedeEditar: boolean;
  puedeSubir: boolean;
  puedeBajar: boolean;
  onSubir: () => void;
  onBajar: () => void;
  onQuitar: () => void;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <div className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-texto)]">{reporte.nombre}</h3>
          <p className="text-xs text-[var(--color-texto-mute)]">{ETIQUETA_ENTIDAD[reporte.entidad]}</p>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuAbierto((v) => !v)}
            className="rounded-md px-2 py-1 text-[var(--color-texto-mute)] hover:bg-[var(--color-bg-elevada)]"
          >
            ⋯
          </button>
          {menuAbierto && (
            <div className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-1 text-sm shadow-lg">
              <button
                onClick={() => {
                  setMenuAbierto(false);
                  onSubir();
                }}
                disabled={!puedeSubir}
                className="block w-full rounded-lg px-2 py-1.5 text-left text-[var(--color-texto)] hover:bg-[var(--color-bg-elevada)] disabled:opacity-40"
              >
                Subir
              </button>
              <button
                onClick={() => {
                  setMenuAbierto(false);
                  onBajar();
                }}
                disabled={!puedeBajar}
                className="block w-full rounded-lg px-2 py-1.5 text-left text-[var(--color-texto)] hover:bg-[var(--color-bg-elevada)] disabled:opacity-40"
              >
                Bajar
              </button>
              {puedeEditar && (
                <button
                  onClick={() => {
                    setMenuAbierto(false);
                    onEditar();
                  }}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-[var(--color-texto)] hover:bg-[var(--color-bg-elevada)]"
                >
                  Editar
                </button>
              )}
              <button
                onClick={() => {
                  setMenuAbierto(false);
                  onQuitar();
                }}
                className="block w-full rounded-lg px-2 py-1.5 text-left text-[var(--color-texto)] hover:bg-[var(--color-bg-elevada)]"
              >
                Quitar de mi dashboard
              </button>
              {puedeEditar && (
                <button
                  onClick={() => {
                    setMenuAbierto(false);
                    onEliminar();
                  }}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-red-500 hover:bg-[var(--color-bg-elevada)]"
                >
                  Eliminar para todos
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {!datos ? (
        <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
      ) : datos.length === 0 ? (
        <p className="text-sm text-[var(--color-texto-mute)]">Sin datos todavía.</p>
      ) : reporte.tipo_grafico === "numero" ? (
        <p className="text-4xl font-bold text-[var(--color-texto)]">{datos[0]?.valor ?? 0}</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            {reporte.tipo_grafico === "linea" ? (
              <LineChart data={datos}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-borde)" />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="valor" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              </LineChart>
            ) : reporte.tipo_grafico === "dona" ? (
              <PieChart>
                <Tooltip />
                <Pie data={datos} dataKey="valor" nameKey="etiqueta" innerRadius="55%" outerRadius="85%">
                  {datos.map((_, i) => (
                    <Cell key={i} fill={COLORES[i % COLORES.length]} />
                  ))}
                </Pie>
              </PieChart>
            ) : (
              <BarChart data={datos}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-borde)" />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="valor" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function FormularioReporte({
  reporte,
  onGuardado,
  onCancelar,
}: {
  reporte: Reporte | null;
  onGuardado: (reporte: Reporte, esNuevo: boolean) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(reporte?.nombre ?? "");
  const [entidad, setEntidad] = useState<EntidadReporte>(reporte?.entidad ?? "contactos");
  const [dimension, setDimension] = useState<DimensionReporte>(reporte?.dimension ?? "etiqueta");
  const [tipoGrafico, setTipoGrafico] = useState<TipoGraficoReporte>(reporte?.tipo_grafico ?? "barras");
  const [agruparFechaPor, setAgruparFechaPor] = useState<AgruparFechaPor>(reporte?.agrupar_fecha_por ?? "dia");
  const [rangoDias, setRangoDias] = useState<string>(reporte?.filtros?.rango_dias ? String(reporte.filtros.rango_dias) : "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opcionesDimension = DIMENSIONES_POR_ENTIDAD[entidad];
  const esFecha = dimension === "fecha_creacion" || dimension === "fecha_modificacion";

  useEffect(() => {
    if (!opcionesDimension.some((o) => o.valor === dimension)) {
      setDimension(opcionesDimension[0].valor);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidad]);

  useEffect(() => {
    if (!esFecha && tipoGrafico === "linea") setTipoGrafico("barras");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esFecha]);

  async function guardar() {
    if (!nombre.trim()) {
      setError("Falta el nombre");
      return;
    }
    setGuardando(true);
    setError(null);

    const body = {
      nombre,
      entidad,
      dimension,
      tipo_grafico: tipoGrafico,
      agrupar_fecha_por: esFecha ? agruparFechaPor : null,
      filtros: { rango_dias: rangoDias ? Number(rangoDias) : null },
    };

    const res = reporte
      ? await fetch(`/api/reportes/${reporte.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch("/api/reportes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    const data = await res.json().catch(() => ({}));
    setGuardando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar");
      return;
    }
    onGuardado(data.reporte, !reporte);
  }

  return (
    <div className="mb-6 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT_LOCAL} />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Entidad</span>
            <select value={entidad} onChange={(e) => setEntidad(e.target.value as EntidadReporte)} className={INPUT_LOCAL}>
              {Object.entries(ETIQUETA_ENTIDAD).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Agrupar por</span>
            <select value={dimension} onChange={(e) => setDimension(e.target.value as DimensionReporte)} className={INPUT_LOCAL}>
              {opcionesDimension.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Tipo de gráfica</span>
            <select value={tipoGrafico} onChange={(e) => setTipoGrafico(e.target.value as TipoGraficoReporte)} className={INPUT_LOCAL}>
              <option value="barras">Barras</option>
              <option value="dona">Dona</option>
              {esFecha && <option value="linea">Línea</option>}
              <option value="numero">Número</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Rango</span>
            <select value={rangoDias} onChange={(e) => setRangoDias(e.target.value)} className={INPUT_LOCAL}>
              <option value="">Todo el histórico</option>
              <option value="7">Últimos 7 días</option>
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
            </select>
          </label>
        </div>

        {esFecha && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Agrupar fecha por</span>
            <select value={agruparFechaPor} onChange={(e) => setAgruparFechaPor(e.target.value as AgruparFechaPor)} className={INPUT_LOCAL}>
              <option value="dia">Día</option>
              <option value="semana">Semana</option>
              <option value="mes">Mes</option>
            </select>
          </label>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancelar} className="rounded-lg border border-[var(--color-borde)] px-4 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            style={{ boxShadow: "var(--halo-accion)" }}
            className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
