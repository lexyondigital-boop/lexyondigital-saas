"use client";

import { useEffect, useState } from "react";

export type LlamadaRetellReporte = {
  callId: string;
  agentId: string | null;
  agentName: string | null;
  callStatus: string;
  disconnectionReason: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  startTimestamp: number | null;
  durationMs: number | null;
  callSuccessful: boolean | null;
  inVoicemail: boolean | null;
  recordingUrl: string | null;
  costoTotal: number | null;
  cuenta?: { id: string; nombre: string; codigo: string | null; slug: string | null } | null;
};

// Reporte "de verdad" de Retell -- jalado en vivo de su API (no depende de
// que nuestro webhook haya llegado). Se usa tanto en Plantillas de Voz
// (cuenta administradora, ve todas las sub-cuentas) como en Agentes de Voz
// de cada sub-cuenta (ve solo lo propio) -- cambia nada más el endpoint y
// si se muestra la columna de cuenta.
export function ReporteLlamadasRetell({
  fetchUrl,
  titulo,
  descripcion,
  mostrarCuenta = false,
}: {
  fetchUrl: string;
  titulo: string;
  descripcion: string;
  mostrarCuenta?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [llamadas, setLlamadas] = useState<LlamadaRetellReporte[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    const res = await fetch(fetchUrl);
    const data = await res.json().catch(() => ({}));
    setCargando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo cargar el reporte de Retell");
      return;
    }
    setLlamadas(data.llamadas ?? []);
  }

  useEffect(() => {
    if (abierto && llamadas === null && !cargando) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  return (
    <div className="mt-8 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-texto)]">{titulo}</h2>
          <p className="text-xs text-[var(--color-texto-mute)]">{descripcion}</p>
        </div>
        <span className="text-sm font-medium text-[var(--color-marca)]">{abierto ? "Ocultar" : "Mostrar"}</span>
      </button>

      {abierto && (
        <div className="mt-4">
          {cargando && <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {!cargando && !error && llamadas && llamadas.length === 0 && (
            <p className="text-sm text-[var(--color-texto-mute)]">Todavía no hay llamadas registradas en Retell.</p>
          )}
          {!cargando && !error && llamadas && llamadas.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-[var(--color-borde)]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-borde)] text-xs text-[var(--color-texto-mute)]">
                    {mostrarCuenta && <th className="px-4 py-3 font-medium">Cuenta</th>}
                    <th className="px-4 py-3 font-medium">Agente</th>
                    <th className="px-4 py-3 font-medium">Desde → Hacia</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Resultado</th>
                    <th className="px-4 py-3 font-medium">Duración</th>
                    <th className="px-4 py-3 font-medium">Costo (Retell)</th>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Grabación</th>
                  </tr>
                </thead>
                <tbody>
                  {llamadas.map((l) => (
                    <tr key={l.callId} className="border-b border-[var(--color-borde)] last:border-0">
                      {mostrarCuenta && (
                        <td className="px-4 py-3 text-[var(--color-texto)]">
                          {l.cuenta ? `${l.cuenta.codigo ?? l.cuenta.nombre} · ${l.cuenta.slug ?? ""}` : "—"}
                        </td>
                      )}
                      <td className="px-4 py-3 text-[var(--color-texto-mute)]">
                        <div>{l.agentName ?? "—"}</div>
                        {l.agentId && <div className="font-mono text-[10px]">{l.agentId}</div>}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-texto-mute)]">
                        {l.fromNumber ?? "—"} → {l.toNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-texto-mute)]">
                        {l.callStatus}
                        {l.disconnectionReason ? ` (${l.disconnectionReason})` : ""}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-texto-mute)]">
                        {l.inVoicemail ? "Buzón de voz" : l.callSuccessful === true ? "Exitosa" : l.callSuccessful === false ? "No exitosa" : "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-texto-mute)]">
                        {l.durationMs ? `${Math.round(l.durationMs / 1000)}s` : "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-texto-mute)]">{l.costoTotal != null ? l.costoTotal.toFixed(4) : "—"}</td>
                      <td className="px-4 py-3 text-[var(--color-texto-mute)]">
                        {l.startTimestamp ? new Date(l.startTimestamp).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {l.recordingUrl ? (
                          <a
                            href={l.recordingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-[var(--color-marca)] hover:underline"
                          >
                            Escuchar
                          </a>
                        ) : (
                          <span className="text-xs text-[var(--color-texto-mute)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
