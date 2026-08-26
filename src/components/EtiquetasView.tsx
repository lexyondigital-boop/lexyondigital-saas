"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/Badge";

type Etiqueta = { id: string; nombre: string; created_at: string };

export function EtiquetasView({ cuentaId }: { cuentaId: string }) {
  const supabase = createClient();
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase.from("etiquetas").select("id, nombre, created_at").order("nombre");
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

    const { error } = await supabase.from("etiquetas").insert({ cuenta_id: cuentaId, nombre: nombre.trim() });
    setEnviando(false);

    if (error) {
      setError(error.message.includes("duplicate") ? "Ya existe una etiqueta con ese nombre." : error.message);
      return;
    }

    setNombre("");
    cargar();
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta etiqueta? No se quita de los contactos que ya la tengan asignada.")) return;
    await supabase.from("etiquetas").delete().eq("id", id);
    cargar();
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-[var(--color-texto)]">Etiquetas</h1>
      <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
        Catálogo de etiquetas disponibles para clasificar contactos y segmentar campañas.
      </p>

      <form onSubmit={crear} className="mt-5 flex gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre de la etiqueta"
          className="w-full max-w-xs rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
        <button
          type="submit"
          disabled={enviando}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="shrink-0 rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          Crear
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        {cargando ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : etiquetas.length === 0 ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Todavía no hay etiquetas.</p>
        ) : (
          etiquetas.map((et) => (
            <div key={et.id} className="flex items-center gap-1.5">
              <Badge tono="ia">{et.nombre}</Badge>
              <button
                onClick={() => eliminar(et.id)}
                className="text-xs text-[var(--color-texto-mute)] hover:text-red-500"
                title="Eliminar"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
