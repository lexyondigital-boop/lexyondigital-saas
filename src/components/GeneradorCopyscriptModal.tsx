"use client";

import { useState } from "react";

// Compartido entre Agentes de Voz (por sub-cuenta) y Plantillas de Voz
// maestras (cuenta master) -- ambos llaman al mismo endpoint, que ya resuelve
// solo la API key de plataforma cuando la cuenta no tiene una propia
// configurada en Agente IA, así que funciona igual para las dos pantallas.
export function GeneradorCopyscriptModal({
  categoria,
  objetivo,
  onUsar,
  onCancelar,
}: {
  categoria: string;
  objetivo: string;
  onUsar: (copyscript: string) => void;
  onCancelar: () => void;
}) {
  const [descripcion, setDescripcion] = useState("");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<string | null>(null);

  async function generar() {
    setGenerando(true);
    setError(null);
    const res = await fetch("/api/plantillas-voz/sugerir-copyscript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoria, objetivo, descripcion }),
    });
    const data = await res.json().catch(() => ({}));
    setGenerando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo generar el copyscript");
      return;
    }
    setBorrador(data.copyscript);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <h2 className="mb-4 text-base font-semibold text-[var(--color-texto)]">Generar copyscript con IA</h2>

        {!borrador ? (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Describe qué debe hacer el agente en la llamada</span>
              <textarea
                rows={4}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej. Llamar a clientes para confirmar que siguen usando el servicio de fumigación y ofrecer renovar el contrato anual."
                className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
              />
            </label>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={generar}
                disabled={generando || !descripcion.trim()}
                style={{ boxShadow: "var(--halo-accion)" }}
                className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {generando ? "Generando…" : "Generar"}
              </button>
              <button onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Copyscript</span>
              <textarea
                rows={12}
                value={borrador}
                onChange={(e) => setBorrador(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
              />
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => onUsar(borrador)}
                style={{ boxShadow: "var(--halo-accion)" }}
                className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
              >
                Usar esto
              </button>
              <button onClick={() => setBorrador(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
                Volver
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
