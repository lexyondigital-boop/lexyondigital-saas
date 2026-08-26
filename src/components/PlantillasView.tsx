"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/Badge";

type Template = {
  id: string;
  name: string;
  language: string;
  status: "pending" | "approved" | "rejected";
  body: string | null;
  variables: string[];
  created_at: string;
};

const TONO_STATUS = { pending: "aviso", approved: "en-vivo", rejected: "mute" } as const;
const LABEL_STATUS = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" } as const;

export function PlantillasView({ cuentaId }: { cuentaId: string }) {
  const supabase = createClient();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<Template | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase.from("templates").select("*").order("created_at", { ascending: false });
    setTemplates(data ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cambiarStatus(id: string, status: Template["status"]) {
    await supabase.from("templates").update({ status }).eq("id", id);
    cargar();
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta plantilla?")) return;
    await supabase.from("templates").delete().eq("id", id);
    cargar();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-texto)]">Plantillas</h1>
          <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
            Solo las plantillas "Aprobada" se usan para enviar campañas.
          </p>
        </div>
        <button
          onClick={() => {
            setEditando(null);
            setMostrarForm((v) => !v);
          }}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
        >
          {mostrarForm && !editando ? "Cancelar" : "Nueva plantilla"}
        </button>
      </div>

      {(mostrarForm || editando) && (
        <TemplateForm
          cuentaId={cuentaId}
          template={editando}
          onGuardado={() => {
            setMostrarForm(false);
            setEditando(null);
            cargar();
          }}
          onCancelar={() => {
            setMostrarForm(false);
            setEditando(null);
          }}
        />
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cargando ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Todavía no hay plantillas.</p>
        ) : (
          templates.map((t) => (
            <div key={t.id} className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-texto)]">{t.name}</h3>
                <Badge tono={TONO_STATUS[t.status]}>{LABEL_STATUS[t.status]}</Badge>
              </div>
              <p className="text-xs text-[var(--color-texto-mute)]">{t.language}</p>
              <p className="mt-2 line-clamp-3 text-sm text-[var(--color-texto)]">{t.body || "—"}</p>
              {t.variables.length > 0 && (
                <p className="mt-2 text-xs text-[var(--color-texto-mute)]">Variables: {t.variables.join(", ")}</p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--color-borde)] pt-3">
                <select
                  value={t.status}
                  onChange={(e) => cambiarStatus(t.id, e.target.value as Template["status"])}
                  className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-2 py-1 text-xs text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
                >
                  <option value="pending">Pendiente</option>
                  <option value="approved">Aprobada</option>
                  <option value="rejected">Rechazada</option>
                </select>
                <button
                  onClick={() => {
                    setMostrarForm(false);
                    setEditando(t);
                  }}
                  className="text-xs font-medium text-[var(--color-marca)] hover:underline"
                >
                  Editar
                </button>
                <button onClick={() => eliminar(t.id)} className="text-xs font-medium text-red-500 hover:underline">
                  Eliminar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TemplateForm({
  cuentaId,
  template,
  onGuardado,
  onCancelar,
}: {
  cuentaId: string;
  template: Template | null;
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const supabase = createClient();
  const [name, setName] = useState(template?.name ?? "");
  const [language, setLanguage] = useState(template?.language ?? "es_MX");
  const [body, setBody] = useState(template?.body ?? "");
  const [variables, setVariables] = useState((template?.variables ?? []).join(", "));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const variablesArray = variables
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    const payload = { name: name.trim(), language: language.trim(), body: body.trim() || null, variables: variablesArray };

    const { error } = template
      ? await supabase.from("templates").update(payload).eq("id", template.id)
      : await supabase.from("templates").insert({ ...payload, cuenta_id: cuentaId });

    setEnviando(false);

    if (error) {
      setError(error.message);
      return;
    }

    onGuardado();
  }

  return (
    <form
      onSubmit={guardar}
      className="mb-2 max-w-xl space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6"
    >
      <h2 className="text-base font-semibold text-[var(--color-texto)]">
        {template ? "Editar plantilla" : "Nueva plantilla"}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nombre</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="nombre_exacto_de_meta"
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Idioma</span>
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Cuerpo del mensaje</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Hola {{1}}, tu cita es el {{2}}."
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Variables</span>
        <input
          value={variables}
          onChange={(e) => setVariables(e.target.value)}
          placeholder="nombre, fecha"
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
        <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
          Separadas por coma, en el mismo orden en que aparecen los {"{{1}}"}, {"{{2}}"}… del mensaje aprobado en Meta.
        </span>
      </label>

      <p className="text-xs text-[var(--color-texto-mute)]">
        El nombre debe coincidir exactamente con el de una plantilla ya aprobada en Meta Business — aquí solo se
        lleva el registro interno, no se sincroniza automáticamente con Meta.
      </p>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={enviando}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {enviando ? "Guardando…" : template ? "Guardar cambios" : "Crear plantilla"}
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
