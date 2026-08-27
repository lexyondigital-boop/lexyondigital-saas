"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/Badge";

type Secreto = {
  clave: "openai_api_key" | "anthropic_api_key";
  vence_en: string | null;
  updated_at: string;
};

const PROVEEDORES: { clave: Secreto["clave"]; etiqueta: string; placeholder: string }[] = [
  { clave: "openai_api_key", etiqueta: "OpenAI", placeholder: "sk-…" },
  { clave: "anthropic_api_key", etiqueta: "Claude (Anthropic)", placeholder: "sk-ant-…" },
];

function diasParaVencer(vence_en: string | null): number | null {
  if (!vence_en) return null;
  const ms = new Date(vence_en).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function ConfiguracionPlataformaView() {
  const supabase = createClient();
  const [secretos, setSecretos] = useState<Record<string, Secreto>>({});
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase.from("plataforma_secretos").select("clave, vence_en, updated_at");
    const mapa: Record<string, Secreto> = {};
    for (const s of (data as Secreto[]) ?? []) mapa[s.clave] = s;
    setSecretos(mapa);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--color-texto)]">Configuración</h1>
      <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
        API keys de plataforma para el modo "Platform key" del Agente IA — se usan cuando una sub-cuenta no trae su
        propia key. Solo visible para el super admin.
      </p>

      <div className="mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
        {cargando ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : (
          PROVEEDORES.map((p) => (
            <TarjetaSecreto key={p.clave} proveedor={p} secreto={secretos[p.clave] ?? null} onGuardado={cargar} />
          ))
        )}
      </div>
    </div>
  );
}

function TarjetaSecreto({
  proveedor,
  secreto,
  onGuardado,
}: {
  proveedor: { clave: Secreto["clave"]; etiqueta: string; placeholder: string };
  secreto: Secreto | null;
  onGuardado: () => void;
}) {
  const [valor, setValor] = useState("");
  const [venceEn, setVenceEn] = useState(secreto?.vence_en ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dias = diasParaVencer(secreto?.vence_en ?? null);
  const vencida = dias !== null && dias < 0;
  const porVencer = dias !== null && dias >= 0 && dias <= 30;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const res = await fetch("/api/plataforma/secretos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave: proveedor.clave, valor, vence_en: venceEn || null }),
    });
    setEnviando(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar");
      return;
    }

    setValor("");
    onGuardado();
  }

  return (
    <div className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-texto)]">{proveedor.etiqueta}</h3>
        {secreto ? (
          <Badge tono={vencida ? "aviso" : porVencer ? "aviso" : "en-vivo"}>
            {vencida ? "Vencida" : "Configurada"}
          </Badge>
        ) : (
          <Badge tono="mute">No configurada</Badge>
        )}
      </div>

      {secreto && (
        <p className="mb-3 text-xs text-[var(--color-texto-mute)]">
          Última actualización: {new Date(secreto.updated_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
          {secreto.vence_en && (
            <>
              {" · "}Vence: {new Date(secreto.vence_en).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
              {porVencer && !vencida && ` (${dias} días)`}
            </>
          )}
        </p>
      )}

      <form onSubmit={guardar} className="space-y-3">
        <input
          type="password"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={secreto ? "Escribe una nueva para reemplazarla" : proveedor.placeholder}
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Vence el (opcional)</span>
          <input
            type="date"
            value={venceEn}
            onChange={(e) => setVenceEn(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={enviando || !valor.trim()}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="w-full rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {enviando ? "Guardando…" : secreto ? "Reemplazar key" : "Guardar key"}
        </button>
      </form>
    </div>
  );
}
