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
  header_tipo: "ninguno" | "imagen" | "video" | "documento";
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

export function PlantillasView({ cuentaId, permisos }: { cuentaId: string; permisos: Record<string, boolean> }) {
  const supabase = createClient();
  const [canal, setCanal] = useState<"whatsapp" | "correo">("whatsapp");
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
            {canal === "whatsapp"
              ? "Se someten directamente a Meta para su revisión. Solo las “Aprobada” se pueden usar en campañas."
              : "Plantillas de correo -- no requieren aprobación, se usan de inmediato en confirmaciones de cita y campañas."}
          </p>
        </div>
        {canal === "whatsapp" && (
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
        )}
      </div>

      {permisos.manage_email && (
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setCanal("whatsapp")}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${canal === "whatsapp" ? "border-[var(--color-marca)] bg-[var(--color-marca)] text-white" : "border-[var(--color-borde)] text-[var(--color-texto-mute)]"}`}
          >
            WhatsApp
          </button>
          <button
            onClick={() => setCanal("correo")}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${canal === "correo" ? "border-[var(--color-marca)] bg-[var(--color-marca)] text-white" : "border-[var(--color-borde)] text-[var(--color-texto-mute)]"}`}
          >
            Correo
          </button>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      {canal === "correo" ? (
        <PlantillasEmailSection cuentaId={cuentaId} />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

const LABEL_TIPO_EMAIL = {
  confirmacion_cita: "Confirmación de cita",
  reagendamiento_cita: "Reagendamiento de cita",
  cancelacion_cita: "Cancelación de cita",
  campana: "Campaña",
} as const;

type PlantillaEmail = {
  id: string;
  nombre: string;
  tipo: "confirmacion_cita" | "reagendamiento_cita" | "cancelacion_cita" | "campana";
  asunto: string;
  cuerpo_html: string;
  activa: boolean;
};

function PlantillasEmailSection({ cuentaId }: { cuentaId: string }) {
  const [plantillas, setPlantillas] = useState<PlantillaEmail[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<PlantillaEmail | "nueva" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    const res = await fetch("/api/plantillas-email");
    const data = await res.json().catch(() => ({}));
    setPlantillas(data.plantillas ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta plantilla de correo?")) return;
    setError(null);
    const res = await fetch(`/api/plantillas-email/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo eliminar");
      return;
    }
    cargar();
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setEditando("nueva")}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
        >
          Nueva plantilla de correo
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      {editando && (
        <FormularioPlantillaEmail
          cuentaId={cuentaId}
          plantilla={editando === "nueva" ? null : editando}
          onGuardado={() => {
            setEditando(null);
            cargar();
          }}
          onCancelar={() => setEditando(null)}
        />
      )}

      <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cargando ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : plantillas.length === 0 ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Todavía no hay plantillas de correo.</p>
        ) : (
          plantillas.map((p) => (
            <div key={p.id} className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-texto)]">{p.nombre}</h3>
                <Badge tono={p.activa ? "en-vivo" : "mute"}>{p.activa ? "Activa" : "Inactiva"}</Badge>
              </div>
              <p className="text-xs text-[var(--color-texto-mute)]">{LABEL_TIPO_EMAIL[p.tipo]}</p>
              <p className="mt-2 line-clamp-2 text-sm text-[var(--color-texto)]">{p.asunto}</p>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--color-borde)] pt-3">
                <button onClick={() => setEditando(p)} className="text-xs font-medium text-[var(--color-marca)] hover:underline">
                  Editar
                </button>
                <button onClick={() => eliminar(p.id)} className="text-xs font-medium text-red-500 hover:underline">
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

function FormularioPlantillaEmail({
  cuentaId,
  plantilla,
  onGuardado,
  onCancelar,
}: {
  cuentaId: string;
  plantilla: PlantillaEmail | null;
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(plantilla?.nombre ?? "");
  const [tipo, setTipo] = useState<"confirmacion_cita" | "reagendamiento_cita" | "cancelacion_cita" | "campana">(plantilla?.tipo ?? "confirmacion_cita");
  const [asunto, setAsunto] = useState(plantilla?.asunto ?? "");
  const [cuerpoHtml, setCuerpoHtml] = useState(plantilla?.cuerpo_html ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const INPUT_LOCAL =
    "w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]";

  async function guardar() {
    setGuardando(true);
    setError(null);
    const body = { nombre, tipo, asunto, cuerpo_html: cuerpoHtml };
    const res = plantilla
      ? await fetch(`/api/plantillas-email/${plantilla.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch("/api/plantillas-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, cuenta_id: cuentaId }) });
    const data = await res.json().catch(() => ({}));
    setGuardando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar");
      return;
    }
    onGuardado();
  }

  return (
    <div className="mb-6 max-w-xl space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
      <h2 className="text-base font-semibold text-[var(--color-texto)]">{plantilla ? "Editar plantilla de correo" : "Nueva plantilla de correo"}</h2>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nombre</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT_LOCAL} />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Se usa para</span>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className={INPUT_LOCAL}>
          <option value="confirmacion_cita">Confirmación de cita</option>
          <option value="reagendamiento_cita">Reagendamiento de cita</option>
          <option value="cancelacion_cita">Cancelación de cita</option>
          <option value="campana">Campaña</option>
        </select>
        {tipo !== "campana" && (
          <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
            Solo puede haber una plantilla activa de este tipo -- se manda automáticamente {tipo === "confirmacion_cita" ? "al agendar" : tipo === "reagendamiento_cita" ? "al reagendar" : "al cancelar"} una cita si el contacto tiene correo.
          </span>
        )}
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Asunto</span>
        <input value={asunto} onChange={(e) => setAsunto(e.target.value)} className={INPUT_LOCAL} />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Cuerpo (HTML)</span>
        <textarea rows={8} value={cuerpoHtml} onChange={(e) => setCuerpoHtml(e.target.value)} className={INPUT_LOCAL} />
        <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
          Variables disponibles: {"{{nombre}}"}, {"{{correo_electronico}}"}
          {tipo !== "campana" && <> , {"{{cita_fecha}}"}, {"{{cita_hora_inicio}}"}, {"{{profesional_nombre}}"}, {"{{tipo_cita}}"}</>}
          , además de cualquier variable personalizada de Variables.
        </span>
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={guardar}
          disabled={guardando || !nombre.trim() || !asunto.trim() || !cuerpoHtml.trim()}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
          Cancelar
        </button>
      </div>
    </div>
  );
}
