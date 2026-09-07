"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ResponsiveContainer } from "recharts";

type PuntoDato = { etiqueta: string; valor: number };
type Agrupacion = "cuenta" | "categoria" | "plantilla" | "fecha";
type Metrica = "llamadas" | "minutos" | "costo";

const INPUT_LOCAL =
  "rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]";

// Dashboard de la cuenta administradora: a diferencia del módulo de
// Reportes de cada sub-cuenta (src/components/ReportesDashboard.tsx), acá
// se cruzan TODAS las cuentas -- no hay reportes guardados/favoritos por
// usuario, es un panel interactivo que se recalcula al cambiar los
// filtros. Ver src/app/api/reportes/agentes-voz-maestro/route.ts.
export function DashboardMaestro() {
  const [agruparPor, setAgruparPor] = useState<Agrupacion>("cuenta");
  const [metrica, setMetrica] = useState<Metrica>("llamadas");
  const [rangoDias, setRangoDias] = useState<string>("30");
  const [datos, setDatos] = useState<PuntoDato[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDatos(null);
    setError(null);
    fetch(`/api/reportes/agentes-voz-maestro?agrupar_por=${agruparPor}&metrica=${metrica}&rango_dias=${rangoDias || "todo"}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error ?? "No se pudo cargar el reporte");
          return;
        }
        setDatos(data.datos ?? []);
      })
      .catch(() => setError("No se pudo cargar el reporte"));
  }, [agruparPor, metrica, rangoDias]);

  const total = (datos ?? []).reduce((s, d) => s + d.valor, 0);
  const formato = (v: number) => (metrica === "minutos" ? v.toFixed(1) : metrica === "costo" ? v.toFixed(2) : String(Math.round(v)));
  const formatoRecharts = (v: unknown) => formato(Number(v) || 0);

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--color-texto)]">Dashboard</h1>
      <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
        Consumo de Agentes de Voz en todas las sub-cuentas: llamadas, minutos y costo reportado por Retell.
      </p>

      <div className="mt-6 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Agrupar por</span>
              <select value={agruparPor} onChange={(e) => setAgruparPor(e.target.value as Agrupacion)} className={INPUT_LOCAL}>
                <option value="cuenta">Sub-cuenta</option>
                <option value="categoria">Categoría</option>
                <option value="plantilla">Agente de voz</option>
                <option value="fecha">Fecha</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Métrica</span>
              <select value={metrica} onChange={(e) => setMetrica(e.target.value as Metrica)} className={INPUT_LOCAL}>
                <option value="llamadas">Llamadas</option>
                <option value="minutos">Minutos</option>
                <option value="costo">Costo (unidades Retell)</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Rango</span>
              <select value={rangoDias} onChange={(e) => setRangoDias(e.target.value)} className={INPUT_LOCAL}>
                <option value="7">Últimos 7 días</option>
                <option value="30">Últimos 30 días</option>
                <option value="90">Últimos 90 días</option>
                <option value="">Todo el histórico</option>
              </select>
            </label>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--color-texto-mute)]">Total</p>
            <p className="text-2xl font-bold text-[var(--color-texto)]">{formato(total)}</p>
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {!error && datos === null && <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>}
        {!error && datos && datos.length === 0 && <p className="text-sm text-[var(--color-texto-mute)]">Sin datos en este rango.</p>}
        {!error && datos && datos.length > 0 && (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datos}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-borde)" />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={formatoRecharts} />
                <Bar dataKey="valor" fill="#8b5cf6" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="valor" position="top" formatter={formatoRecharts} style={{ fontSize: 11, fill: "var(--color-texto-mute)" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
