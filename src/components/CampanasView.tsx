"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/Badge";

type Campana = {
  id: string;
  nombre: string;
  status: "borrador" | "enviando" | "pausada" | "enviada";
  total_destinatarios: number;
  total_enviados: number;
  created_at: string;
  templates: { name: string } | null;
  etiquetas: { nombre: string } | null;
};

const TONO_STATUS = { borrador: "mute", enviando: "en-vivo", pausada: "aviso", enviada: "marca" } as const;
const LABEL_STATUS = { borrador: "Borrador", enviando: "Enviando", pausada: "Pausada", enviada: "Enviada" } as const;

export function CampanasView({ cuentaId }: { cuentaId: string }) {
  const supabase = createClient();
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string; status: string }[]>([]);
  const [etiquetas, setEtiquetas] = useState<{ id: string; nombre: string }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [iniciando, setIniciando] = useState<Campana | null>(null);

  async function cargar() {
    setCargando(true);
    const [{ data: c }, { data: t }, { data: e }] = await Promise.all([
      supabase
        .from("campanas")
        .select("id, nombre, status, total_destinatarios, total_enviados, created_at, templates(name), etiquetas(nombre)")
        .order("created_at", { ascending: false }),
      supabase.from("templates").select("id, name, status").eq("status", "approved"),
      supabase.from("etiquetas").select("id, nombre").order("nombre"),
    ]);
    setCampanas((c as unknown as Campana[]) ?? []);
    setTemplates(t ?? []);
    setEtiquetas(e ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pausar(id: string) {
    await supabase.from("campanas").update({ status: "pausada" }).eq("id", id);
    cargar();
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta campaña?")) return;
    await supabase.from("campanas").delete().eq("id", id);
    cargar();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-texto)]">Campañas</h1>
          <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
            {campanas.length} campaña{campanas.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          onClick={() => setMostrarForm((v) => !v)}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
        >
          {mostrarForm ? "Cancelar" : "Nueva campaña"}
        </button>
      </div>

      {mostrarForm && (
        <CampanaForm
          cuentaId={cuentaId}
          templates={templates}
          etiquetas={etiquetas}
          onCreada={() => {
            setMostrarForm(false);
            cargar();
          }}
        />
      )}

      {iniciando && (
        <IniciarCampanaForm
          campana={iniciando}
          onListo={() => {
            setIniciando(null);
            cargar();
          }}
          onCancelar={() => setIniciando(null)}
        />
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)]">
        {cargando ? (
          <p className="p-6 text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : campanas.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-texto-mute)]">Todavía no hay campañas.</p>
        ) : (
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-borde)] text-xs uppercase tracking-wide text-[var(--color-texto-mute)]">
                <th className="px-5 py-3 font-medium">Nombre</th>
                <th className="px-5 py-3 font-medium">Plantilla</th>
                <th className="px-5 py-3 font-medium">Etiqueta objetivo</th>
                <th className="px-5 py-3 font-medium">Progreso</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {campanas.map((c) => (
                <tr key={c.id} className="border-b border-[var(--color-borde)] last:border-0">
                  <td className="px-5 py-3.5 font-medium text-[var(--color-texto)]">{c.nombre}</td>
                  <td className="px-5 py-3.5 text-[var(--color-texto-mute)]">{c.templates?.name ?? "—"}</td>
                  <td className="px-5 py-3.5 text-[var(--color-texto-mute)]">{c.etiquetas?.nombre ?? "—"}</td>
                  <td className="px-5 py-3.5 text-[var(--color-texto)]">
                    {c.total_enviados}/{c.total_destinatarios}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tono={TONO_STATUS[c.status]}>{LABEL_STATUS[c.status]}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {(c.status === "borrador" || c.status === "pausada") && (
                      <button
                        onClick={() => setIniciando(c)}
                        className="mr-3 text-sm font-medium text-[var(--color-marca)] hover:underline"
                      >
                        {c.status === "pausada" ? "Reanudar" : "Iniciar"}
                      </button>
                    )}
                    {c.status === "enviando" && (
                      <button onClick={() => pausar(c.id)} className="mr-3 text-sm font-medium text-[var(--color-texto)] hover:underline">
                        Pausar
                      </button>
                    )}
                    <button onClick={() => eliminar(c.id)} className="text-sm font-medium text-red-500 hover:underline">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CampanaForm({
  cuentaId,
  templates,
  etiquetas,
  onCreada,
}: {
  cuentaId: string;
  templates: { id: string; name: string }[];
  etiquetas: { id: string; nombre: string }[];
  onCreada: () => void;
}) {
  const supabase = createClient();
  const [nombre, setNombre] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [etiquetaId, setEtiquetaId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const { error } = await supabase.from("campanas").insert({
      cuenta_id: cuentaId,
      nombre: nombre.trim(),
      template_id: templateId || null,
      etiqueta_id: etiquetaId || null,
    });

    setEnviando(false);

    if (error) {
      setError(error.message);
      return;
    }

    onCreada();
  }

  return (
    <form
      onSubmit={crear}
      className="mb-2 max-w-xl space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6"
    >
      <h2 className="text-base font-semibold text-[var(--color-texto)]">Nueva campaña</h2>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nombre</span>
        <input
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Plantilla</span>
          <select
            required
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          >
            <option value="">Selecciona…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {templates.length === 0 && (
            <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
              No hay plantillas aprobadas todavía.
            </span>
          )}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Etiqueta objetivo</span>
          <select
            required
            value={etiquetaId}
            onChange={(e) => setEtiquetaId(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          >
            <option value="">Selecciona…</option>
            {etiquetas.map((et) => (
              <option key={et.id} value={et.id}>
                {et.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-xs text-[var(--color-texto-mute)]">
        Se enviará a los contactos activos que tengan esta etiqueta. La campaña se crea en borrador — el envío
        empieza al darle "Iniciar".
      </p>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={enviando}
        style={{ boxShadow: "var(--halo-accion)" }}
        className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {enviando ? "Creando…" : "Crear campaña"}
      </button>
    </form>
  );
}

function IniciarCampanaForm({
  campana,
  onListo,
  onCancelar,
}: {
  campana: Campana;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [variables, setVariables] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function iniciar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const variablesArray = variables
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    const res = await fetch(`/api/campanas/${campana.id}/iniciar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variables: variablesArray }),
    });
    const data = await res.json();
    setEnviando(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo iniciar la campaña");
      return;
    }

    onListo();
  }

  return (
    <form
      onSubmit={iniciar}
      className="mb-2 max-w-xl space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6"
    >
      <h2 className="text-base font-semibold text-[var(--color-texto)]">Iniciar "{campana.nombre}"</h2>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">
          Valores para las variables de la plantilla (opcional)
        </span>
        <input
          value={variables}
          onChange={(e) => setVariables(e.target.value)}
          placeholder="Juan, 20 de agosto"
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
        <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
          Separados por coma, mismo orden que {"{{1}}"}, {"{{2}}"}… — se usan igual para todos los destinatarios de
          este envío.
        </span>
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={enviando}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {enviando ? "Iniciando…" : "Confirmar e iniciar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
