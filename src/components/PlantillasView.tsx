"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/Badge";
import { AsistentePlantillaModal } from "@/components/AsistentePlantillaModal";

export type Boton = { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phone_number?: string };
export type Tarjeta = { media_tipo: "imagen" | "video"; media_url: string; media_handle: string | null; body: string; body_ejemplos: string[]; botones: Boton[] };

export type Template = {
  id: string;
  name: string;
  language: string;
  status: "pending" | "approved" | "rejected" | "paused" | "disabled";
  body: string | null;
  variables: string[];
  variables_mapeo: (string | null)[];
  categoria: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  cuenta_whatsapp_id: string | null;
  header_tipo: "ninguno" | "texto" | "imagen" | "video" | "documento";
  header_texto: string | null;
  header_texto_ejemplo: string | null;
  header_variable_clave: string | null;
  header_media_url: string | null;
  header_media_handle: string | null;
  footer_texto: string | null;
  botones: Boton[];
  usa_carrusel: boolean;
  tarjetas: Tarjeta[];
  webhook_url: string | null;
  webhook_headers: Record<string, string>;
  etiquetas_envio: string[];
  etapa_destino_id: string | null;
  meta_template_id: string | null;
  error_meta: string | null;
  created_at: string;
};

const TONO_STATUS = { pending: "aviso", approved: "en-vivo", rejected: "mute", paused: "aviso", disabled: "mute" } as const;
const LABEL_STATUS = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada", paused: "Pausada", disabled: "Deshabilitada" } as const;
const LABEL_CATEGORIA = { MARKETING: "Marketing", UTILITY: "Utilidad", AUTHENTICATION: "Autenticación" } as const;

export function PlantillasView({ cuentaId }: { cuentaId: string }) {
  const supabase = createClient();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<Template | null>(null);
  const [mostrarAsistente, setMostrarAsistente] = useState(false);
  const [reenviando, setReenviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta plantilla? Si ya fue sometida a Meta, también se intentará eliminar allá.")) return;
    setError(null);
    const res = await fetch(`/api/plantillas/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo eliminar la plantilla");
      return;
    }
    cargar();
  }

  async function reenviar(id: string) {
    setReenviando(id);
    setError(null);
    const res = await fetch(`/api/plantillas/${id}/reenviar`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setReenviando(null);
    if (!res.ok) {
      setError(data.error ?? "No se pudo reenviar la plantilla");
      return;
    }
    if (data.meta_error) {
      setError(`Meta respondió: ${data.meta_error}`);
    }
    cargar();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-texto)]">Plantillas</h1>
          <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
            Se someten directamente a Meta para su revisión. Solo las &ldquo;Aprobada&rdquo; se pueden usar en campañas.
          </p>
        </div>
        <button
          onClick={() => {
            setEditando(null);
            setMostrarAsistente(true);
          }}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
        >
          Nueva plantilla
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      {mostrarAsistente && (
        <AsistentePlantillaModal
          cuentaId={cuentaId}
          plantilla={editando}
          onGuardado={() => {
            setMostrarAsistente(false);
            setEditando(null);
            cargar();
          }}
          onCancelar={() => {
            setMostrarAsistente(false);
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
              <p className="text-xs text-[var(--color-texto-mute)]">
                {LABEL_CATEGORIA[t.categoria]} · {t.language}
              </p>
              <p className="mt-2 line-clamp-3 text-sm text-[var(--color-texto)]">{t.body || "—"}</p>
              {t.error_meta && <p className="mt-2 text-xs text-red-500">{t.error_meta}</p>}

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--color-borde)] pt-3">
                <button
                  onClick={() => {
                    setEditando(t);
                    setMostrarAsistente(true);
                  }}
                  className="text-xs font-medium text-[var(--color-marca)] hover:underline"
                >
                  Editar
                </button>
                {t.status !== "approved" && (
                  <button
                    onClick={() => reenviar(t.id)}
                    disabled={reenviando === t.id}
                    className="text-xs font-medium text-[var(--color-marca)] hover:underline disabled:opacity-60"
                  >
                    {reenviando === t.id ? "Reenviando…" : "Reenviar a Meta"}
                  </button>
                )}
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
