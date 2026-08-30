"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { LABEL_TIPO, slugificarClaveVariable, type CampoPersonalizado, type TipoCampo } from "@/lib/campos-personalizados";

const TIPOS_CON_OPCIONES: TipoCampo[] = ["select", "checkbox"];

export function VariablesView({ cuentaId }: { cuentaId: string }) {
  const supabase = createClient();
  const [campos, setCampos] = useState<CampoPersonalizado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<CampoPersonalizado | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase.from("campos_personalizados").select("*").order("orden");
    setCampos((data as CampoPersonalizado[]) ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este campo? También se borran los valores que tengan los contactos.")) return;
    await supabase.from("campos_personalizados").delete().eq("id", id);
    cargar();
  }

  async function mover(campo: CampoPersonalizado, direccion: -1 | 1) {
    const idx = campos.findIndex((c) => c.id === campo.id);
    const vecino = campos[idx + direccion];
    if (!vecino) return;
    await Promise.all([
      supabase.from("campos_personalizados").update({ orden: vecino.orden }).eq("id", campo.id),
      supabase.from("campos_personalizados").update({ orden: campo.orden }).eq("id", vecino.id),
    ]);
    cargar();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-texto)]">Variables</h1>
          <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
            Campos personalizados que se piden al crear/editar un contacto, además de nombre, teléfono y etiquetas. Los
            que tengan una clave también se pueden usar como <code>{"{{clave}}"}</code> en el prompt del Agente IA para
            que las pida y las guarde solo.
          </p>
        </div>
        <button
          onClick={() => {
            setEditando(null);
            setMostrarForm((v) => !v);
          }}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="shrink-0 rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
        >
          {mostrarForm && !editando ? "Cancelar" : "Nuevo campo"}
        </button>
      </div>

      {(mostrarForm || editando) && (
        <CampoForm
          cuentaId={cuentaId}
          campo={editando}
          siguienteOrden={campos.length}
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

      <div className="mt-6 max-w-2xl space-y-2">
        {cargando ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : campos.length === 0 ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Todavía no hay campos personalizados.</p>
        ) : (
          campos.map((c, idx) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-texto)]">
                  {c.nombre} {c.requerido && <span className="text-red-500">*</span>}
                  {c.es_fijo && (
                    <span className="ml-2 rounded-full bg-[var(--color-bg-elevada)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-texto-mute)]">
                      Fija del sistema
                    </span>
                  )}
                </p>
                <p className="text-xs text-[var(--color-texto-mute)]">
                  {LABEL_TIPO[c.tipo]}
                  {TIPOS_CON_OPCIONES.includes(c.tipo) && c.opciones.length > 0 && ` — ${c.opciones.join(", ")}`}
                </p>
                {c.clave_variable && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(`{{${c.clave_variable}}}`)}
                    title="Copiar para pegar en el prompt del Agente IA"
                    className="mt-1.5 rounded-md bg-[var(--color-bg-elevada)] px-2 py-0.5 font-mono text-xs text-[var(--color-marca)] hover:opacity-80"
                  >
                    {`{{${c.clave_variable}}}`}
                    {c.mapea_a_columna_real === "nombre_completo" && (
                      <span className="ml-1.5 text-[var(--color-texto-mute)]">→ nombre completo del contacto</span>
                    )}
                    {c.mapea_a_columna_real === "telefono" && (
                      <span className="ml-1.5 text-[var(--color-texto-mute)]">→ teléfono del contacto (solo lectura)</span>
                    )}
                    {c.mapea_a_columna_real === "correo_electronico" && (
                      <span className="ml-1.5 text-[var(--color-texto-mute)]">→ correo del contacto</span>
                    )}
                  </button>
                )}
              </div>
              {c.es_fijo ? (
                <p className="shrink-0 text-xs text-[var(--color-texto-mute)]">No editable</p>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => mover(c, -1)}
                    disabled={idx === 0}
                    className="text-[var(--color-texto-mute)] hover:text-[var(--color-texto)] disabled:opacity-30"
                    title="Subir"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => mover(c, 1)}
                    disabled={idx === campos.length - 1}
                    className="text-[var(--color-texto-mute)] hover:text-[var(--color-texto)] disabled:opacity-30"
                    title="Bajar"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => {
                      setMostrarForm(false);
                      setEditando(c);
                    }}
                    className="text-sm font-medium text-[var(--color-marca)] hover:underline"
                  >
                    Editar
                  </button>
                  <button onClick={() => eliminar(c.id)} className="text-sm font-medium text-red-500 hover:underline">
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CampoForm({
  cuentaId,
  campo,
  siguienteOrden,
  onGuardado,
  onCancelar,
}: {
  cuentaId: string;
  campo: CampoPersonalizado | null;
  siguienteOrden: number;
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const supabase = createClient();
  const [nombre, setNombre] = useState(campo?.nombre ?? "");
  const [tipo, setTipo] = useState<TipoCampo>(campo?.tipo ?? "text");
  const [requerido, setRequerido] = useState(campo?.requerido ?? false);
  const [opciones, setOpciones] = useState((campo?.opciones ?? []).join(", "));
  const [claveVariable, setClaveVariable] = useState(campo?.clave_variable ?? "");
  const [claveEditadaManualmente, setClaveEditadaManualmente] = useState(!!campo?.clave_variable);
  // El formulario solo ofrece "nombre_completo" como destino elegible -- las
  // variables fijas del sistema (telefono, correo_electronico) nunca pasan
  // por este form (están protegidas contra edición), pero el tipo se
  // mantiene amplio porque CampoPersonalizado admite esos otros valores.
  const [mapeaColumnaReal, setMapeaColumnaReal] = useState<Exclude<CampoPersonalizado["mapea_a_columna_real"], null> | "">(
    campo?.mapea_a_columna_real ?? "",
  );
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onNombreChange(valor: string) {
    setNombre(valor);
    if (!claveEditadaManualmente) setClaveVariable(slugificarClaveVariable(valor));
  }

  function onClaveChange(valor: string) {
    setClaveEditadaManualmente(true);
    setClaveVariable(slugificarClaveVariable(valor));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const opcionesArray = TIPOS_CON_OPCIONES.includes(tipo)
      ? opciones
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : [];

    const claveFinal = claveVariable.trim() || null;
    const payload = {
      nombre: nombre.trim(),
      tipo,
      requerido,
      opciones: opcionesArray,
      clave_variable: claveFinal,
      mapea_a_columna_real: claveFinal ? mapeaColumnaReal || null : null,
    };

    const { error } = campo
      ? await supabase.from("campos_personalizados").update(payload).eq("id", campo.id)
      : await supabase.from("campos_personalizados").insert({ ...payload, cuenta_id: cuentaId, orden: siguienteOrden });

    setEnviando(false);

    if (error) {
      setError(error.message.includes("duplicate") ? "Ya existe otra variable con esa clave en esta cuenta." : error.message);
      return;
    }

    onGuardado();
  }

  return (
    <form
      onSubmit={guardar}
      className="mb-2 max-w-xl space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6"
    >
      <h2 className="text-base font-semibold text-[var(--color-texto)]">{campo ? "Editar campo" : "Nuevo campo"}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nombre del campo</span>
          <input
            required
            value={nombre}
            onChange={(e) => onNombreChange(e.target.value)}
            placeholder="Ej. Profesión"
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Tipo</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoCampo)}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          >
            {Object.entries(LABEL_TIPO).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>

      {TIPOS_CON_OPCIONES.includes(tipo) && (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Opciones</span>
          <input
            value={opciones}
            onChange={(e) => setOpciones(e.target.value)}
            placeholder="Opción 1, Opción 2, Opción 3"
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
          <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">Separadas por coma.</span>
        </label>
      )}

      <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-texto)]">
        <input type="checkbox" checked={requerido} onChange={(e) => setRequerido(e.target.checked)} />
        Obligatorio al crear un contacto
      </label>

      <div className="rounded-xl border border-[var(--color-borde)] p-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Clave para el prompt del Agente IA (opcional)</span>
          <input
            value={claveVariable}
            onChange={(e) => onClaveChange(e.target.value)}
            placeholder="ej. telefono_alterno"
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 font-mono text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
          <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
            Si la defines, puedes escribir <code>{claveVariable ? `{{${claveVariable}}}` : "{{clave}}"}</code> en el
            prompt del Agente IA para que se lo pida al cliente y lo guarde solo.
          </span>
        </label>

        {claveVariable.trim() && (
          <label className="mt-3 block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Cuando el agente capture este dato, guardarlo en</span>
            <select
              value={mapeaColumnaReal}
              onChange={(e) => setMapeaColumnaReal(e.target.value as Exclude<CampoPersonalizado["mapea_a_columna_real"], null> | "")}
              className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
            >
              <option value="">Este campo personalizado (por default)</option>
              <option value="nombre_completo">Nombre completo del contacto</option>
            </select>
          </label>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={enviando}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {enviando ? "Guardando…" : campo ? "Guardar cambios" : "Crear campo"}
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
