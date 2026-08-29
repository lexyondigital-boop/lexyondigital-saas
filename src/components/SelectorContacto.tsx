"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { CampoTelefono } from "@/components/CampoTelefono";

export type ContactoSeleccionado = { id: string; nombre: string | null; nombre_completo: string | null; telefono: string };

// Modal de buscar-o-crear contacto: se usa donde haga falta elegir un
// contacto (agendar cita, etc). Si no existe, se crea ahí mismo -- queda en
// la misma tabla "contactos" que ve la sección de Contactos, sin pasos
// aparte.
export function SelectorContacto({
  cuentaId,
  onSeleccionar,
  onCerrar,
}: {
  cuentaId: string;
  onSeleccionar: (contacto: ContactoSeleccionado) => void;
  onCerrar: () => void;
}) {
  const supabase = createClient();
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ContactoSeleccionado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [telefonoNuevo, setTelefonoNuevo] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (busqueda.trim().length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("contactos")
        .select("id, nombre, nombre_completo, telefono")
        .or(`nombre.ilike.%${busqueda}%,nombre_completo.ilike.%${busqueda}%,telefono.ilike.%${busqueda}%`)
        .limit(8);
      setResultados(data ?? []);
      setBuscando(false);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (!telefonoNuevo.trim()) {
      setError("El teléfono es obligatorio");
      return;
    }
    setCreando(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("contactos")
      .insert({
        cuenta_id: cuentaId,
        nombre_completo: nombreNuevo.trim() || null,
        telefono: telefonoNuevo.trim(),
        canal_origen: "manual",
      })
      .select("id, nombre, nombre_completo, telefono")
      .single();

    setCreando(false);

    if (err) {
      setError(err.message.includes("duplicate") ? "Ya existe un contacto con ese teléfono" : err.message);
      return;
    }
    onSeleccionar(data);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <h2 className="text-base font-semibold text-[var(--color-texto)]">{mostrarCrear ? "Nuevo contacto" : "Buscar contacto"}</h2>

        {!mostrarCrear ? (
          <>
            <input
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre, número o teléfono"
              className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
            />

            <div className="max-h-64 space-y-1 overflow-y-auto">
              {buscando && <p className="p-2 text-sm text-[var(--color-texto-mute)]">Buscando…</p>}
              {!buscando && busqueda.trim().length >= 2 && resultados.length === 0 && (
                <p className="p-2 text-sm text-[var(--color-texto-mute)]">Sin resultados para &quot;{busqueda}&quot;.</p>
              )}
              {resultados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSeleccionar(c)}
                  className="block w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-left text-sm text-[var(--color-texto)] hover:opacity-80"
                >
                  {c.nombre ?? c.nombre_completo ?? "Sin nombre"} — {c.telefono}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-[var(--color-borde)] pt-4">
              <button
                type="button"
                onClick={() => {
                  setNombreNuevo("");
                  setTelefonoNuevo(/^\d+$/.test(busqueda.trim()) ? busqueda.trim() : "");
                  setMostrarCrear(true);
                }}
                className="text-sm font-medium text-[var(--color-marca)] hover:underline"
              >
                + Crear contacto nuevo
              </button>
              <button type="button" onClick={onCerrar} className="text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={crear} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--color-texto)]">Nombre completo (opcional)</span>
              <input value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]" />
            </label>
            <CampoTelefono required value={telefonoNuevo} onChange={setTelefonoNuevo} />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-3 border-t border-[var(--color-borde)] pt-4">
              <button type="submit" disabled={creando} style={{ boxShadow: "var(--halo-accion)" }} className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] disabled:opacity-60">
                {creando ? "Creando…" : "Crear y elegir"}
              </button>
              <button type="button" onClick={() => setMostrarCrear(false)} className="text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
                Volver a buscar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
