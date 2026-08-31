"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Etiqueta = { id: string; nombre: string; color: string; created_at: string };

const COLORES_PRESET = ["#8b5cf6", "#0ea5e9", "#f97316", "#eab308", "#22c55e", "#ef4444", "#64748b", "#ec4899"];

function ChipEtiqueta({ nombre, color }: { nombre: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {nombre}
    </span>
  );
}

function SelectorColor({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {COLORES_PRESET.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="h-6 w-6 shrink-0 rounded-full"
          style={{ background: c, outline: color === c ? "2px solid var(--color-texto)" : "none", outlineOffset: 2 }}
          title={c}
        />
      ))}
      <input
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-8 shrink-0 cursor-pointer rounded border border-[var(--color-borde)] bg-transparent"
        title="Color personalizado"
      />
    </div>
  );
}

export function EtiquetasView({ cuentaId }: { cuentaId: string }) {
  const supabase = createClient();
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState(COLORES_PRESET[0]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editandoColorId, setEditandoColorId] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    const { data, error } = await supabase.from("etiquetas").select("id, nombre, color, created_at").order("nombre");
    if (error) {
      setError(error.message);
      setCargando(false);
      return;
    }
    setEtiquetas(data ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setEnviando(true);
    setError(null);

    try {
      const { error } = await supabase.from("etiquetas").insert({ cuenta_id: cuentaId, nombre: nombre.trim(), color });
      if (error) {
        setError(error.message.includes("duplicate") ? "Ya existe una etiqueta con ese nombre." : error.message);
        return;
      }
      setNombre("");
      setColor(COLORES_PRESET[0]);
      await cargar();
    } finally {
      setEnviando(false);
    }
  }

  async function cambiarColor(id: string, nuevoColor: string) {
    setEtiquetas((prev) => prev.map((et) => (et.id === id ? { ...et, color: nuevoColor } : et)));
    const { error } = await supabase.from("etiquetas").update({ color: nuevoColor }).eq("id", id);
    if (error) setError(error.message);
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta etiqueta? No se quita de los contactos que ya la tengan asignada.")) return;
    const { error } = await supabase.from("etiquetas").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    cargar();
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-[var(--color-texto)]">Etiquetas</h1>
      <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
        Catálogo de etiquetas disponibles para clasificar contactos y segmentar campañas.
      </p>

      <form onSubmit={crear} className="mt-5 space-y-3 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-4">
        <div className="flex gap-2">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de la etiqueta"
            className="w-full max-w-xs rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
          <button
            type="submit"
            disabled={enviando || !nombre.trim()}
            style={{ boxShadow: "var(--halo-accion)" }}
            className="shrink-0 rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {enviando ? "Creando…" : "Crear"}
          </button>
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-[var(--color-texto-mute)]">Color</span>
          <SelectorColor color={color} onChange={setColor} />
        </div>
        <div className="pt-1">
          <span className="mb-1 block text-xs text-[var(--color-texto-mute)]">Vista previa</span>
          <ChipEtiqueta nombre={nombre.trim() || "etiqueta"} color={color} />
        </div>
      </form>
      {error && (
        <p className="mt-2 text-sm" style={{ color: "var(--color-aviso)" }}>
          {error}
        </p>
      )}

      <div className="mt-6 space-y-2">
        {cargando ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : etiquetas.length === 0 ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Todavía no hay etiquetas.</p>
        ) : (
          etiquetas.map((et) => (
            <div key={et.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] px-3 py-2">
              <div className="flex items-center gap-2">
                <ChipEtiqueta nombre={et.nombre} color={et.color} />
                <button
                  type="button"
                  onClick={() => setEditandoColorId((prev) => (prev === et.id ? null : et.id))}
                  className="text-xs font-medium text-[var(--color-marca)] hover:underline"
                >
                  {editandoColorId === et.id ? "Listo" : "Cambiar color"}
                </button>
              </div>
              <button onClick={() => eliminar(et.id)} className="text-xs font-medium text-red-500 hover:underline" title="Eliminar">
                Eliminar
              </button>
              {editandoColorId === et.id && (
                <div className="w-full pt-1">
                  <SelectorColor color={et.color} onChange={(c) => cambiarColor(et.id, c)} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
