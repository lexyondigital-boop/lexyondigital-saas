"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LABEL_TIPO, type CampoPersonalizado, type TipoCampo } from "@/lib/campos-personalizados";
import { CampoVariableForm } from "@/components/CampoVariableForm";

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
        <CampoVariableForm
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
