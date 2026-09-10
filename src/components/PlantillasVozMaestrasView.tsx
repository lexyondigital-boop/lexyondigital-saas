"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { ReporteLlamadasRetell } from "@/components/ReporteLlamadasRetell";
import { AGENTES_TIPO_VOZ, CATEGORIAS_VOZ } from "@/lib/plantillas-voz";

// Cada sub-cuenta crea y configura su propio agente de voz directamente
// (Agentes de Voz, máximo uno por ahora) -- esta pantalla, del lado de la
// cuenta master, es de solo lectura: qué agente tiene configurado cada
// sub-cuenta, con datos en vivo de Retell.
export function PlantillasVozMaestrasView() {
  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--color-texto)]">Agentes de Voz</h1>
      <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
        Qué agente de voz tiene configurado cada sub-cuenta, con datos en vivo de Retell.
      </p>

      <AgentesConfiguradosPorCuenta />
      <ReporteLlamadasRetell
        fetchUrl="/api/llamadas-voz/reporte-retell"
        titulo="Reporte completo de llamadas (Retell)"
        descripcion="Datos en vivo directo de Retell, de todas las sub-cuentas (key maestra + cuentas con Retell propio)."
        mostrarCuenta
      />
    </div>
  );
}

type AgenteConfigurado = {
  id: string;
  nombre: string;
  agente_tipo: string;
  categoria: string;
  publicada: boolean;
  modo_agente: string;
  retell_agent_id: string | null;
  cuenta: { id: string; nombre: string; codigo: string | null; slug: string | null } | null;
};

// Qué agente de voz (Agent ID de Retell) tiene configurado cada sub-cuenta
// -- datos de nuestra base, sin llamar a Retell. Se carga sola al entrar
// porque es una sola consulta a nuestra propia tabla, no a una API externa.
function AgentesConfiguradosPorCuenta() {
  const [agentes, setAgentes] = useState<AgenteConfigurado[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/plantillas-voz/global")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error ?? "No se pudo cargar los agentes por sub-cuenta");
          return;
        }
        setAgentes(data.agentes ?? []);
      })
      .catch(() => setError("No se pudo cargar los agentes por sub-cuenta"));
  }, []);

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-base font-semibold text-[var(--color-texto)]">Agentes configurados por sub-cuenta</h2>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
      {!error && agentes === null && <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>}
      {!error && agentes && agentes.length === 0 && (
        <p className="text-sm text-[var(--color-texto-mute)]">Todavía ninguna sub-cuenta ha creado un agente de voz.</p>
      )}
      {!error && agentes && agentes.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-borde)] text-xs text-[var(--color-texto-mute)]">
                <th className="px-4 py-3 font-medium">Sub-cuenta</th>
                <th className="px-4 py-3 font-medium">Agente</th>
                <th className="px-4 py-3 font-medium">Tipo · Categoría</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Agent ID (Retell)</th>
              </tr>
            </thead>
            <tbody>
              {agentes.map((a) => (
                <tr key={a.id} className="border-b border-[var(--color-borde)] last:border-0">
                  <td className="px-4 py-3 text-[var(--color-texto)]">
                    {a.cuenta ? `${a.cuenta.codigo ?? a.cuenta.nombre} · ${a.cuenta.slug ?? ""}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-texto-mute)]">{a.nombre}</td>
                  <td className="px-4 py-3 text-[var(--color-texto-mute)]">
                    {AGENTES_TIPO_VOZ.find((t) => t.valor === a.agente_tipo)?.etiqueta ?? a.agente_tipo} ·{" "}
                    {CATEGORIAS_VOZ.find((c) => c.valor === a.categoria)?.etiqueta ?? a.categoria}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tono={a.publicada ? "en-vivo" : "mute"}>{a.publicada ? "Activo" : "Inactivo"}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-texto-mute)]">
                    {a.retell_agent_id ?? (a.modo_agente === "retell_propio" ? "Agente propio (sin ID registrado)" : "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
