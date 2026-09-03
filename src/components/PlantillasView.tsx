"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/Badge";
import { AsistentePlantillaModal } from "@/components/AsistentePlantillaModal";
import { renderizarPreview } from "@/lib/plantillas-email-preview";
import { PLANTILLAS_EMAIL_PREDETERMINADAS } from "@/lib/plantillas-email-predeterminadas";

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

type ProfesionalLitePreview = { id: string; nombre: string; logo_url: string | null; color_marca: string | null; redes_sociales: { facebook?: string; instagram?: string; tiktok?: string } | null };

function EditorHtmlConPreview({ value, onChange, cuentaId, rows = 8 }: { value: string; onChange: (v: string) => void; cuentaId: string; rows?: number }) {
  const [vista, setVista] = useState<"editar" | "preview">("editar");
  const [profesionales, setProfesionales] = useState<ProfesionalLitePreview[]>([]);
  const [profesionalId, setProfesionalId] = useState("");
  const [overrides, setOverrides] = useState<{ profesional_color: string; profesional_logo: string; profesional_facebook: string; profesional_instagram: string; profesional_tiktok: string }>({
    profesional_color: "",
    profesional_logo: "",
    profesional_facebook: "",
    profesional_instagram: "",
    profesional_tiktok: "",
  });
  const INPUT_LOCAL =
    "w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]";

  useEffect(() => {
    createClient()
      .from("profesionales")
      .select("id, nombre, logo_url, color_marca, redes_sociales")
      .eq("cuenta_id", cuentaId)
      .eq("estado", "activo")
      .order("nombre")
      .then(({ data }) => setProfesionales((data as ProfesionalLitePreview[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegirProfesional(id: string) {
    setProfesionalId(id);
    const p = profesionales.find((x) => x.id === id);
    setOverrides({
      profesional_color: p?.color_marca ?? "",
      profesional_logo: p?.logo_url ?? "",
      profesional_facebook: p?.redes_sociales?.facebook ?? "",
      profesional_instagram: p?.redes_sociales?.instagram ?? "",
      profesional_tiktok: p?.redes_sociales?.tiktok ?? "",
    });
  }

  const overridesLimpios = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v.trim()));

  return (
    <div>
      <div className="mb-1.5 flex gap-2">
        <button
          type="button"
          onClick={() => setVista("editar")}
          className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${vista === "editar" ? "border-[var(--color-marca)] bg-[var(--color-marca)] text-white" : "border-[var(--color-borde)] text-[var(--color-texto-mute)]"}`}
        >
          Editar
        </button>
        <button
          type="button"
          onClick={() => setVista("preview")}
          className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${vista === "preview" ? "border-[var(--color-marca)] bg-[var(--color-marca)] text-white" : "border-[var(--color-borde)] text-[var(--color-texto-mute)]"}`}
        >
          Vista previa
        </button>
      </div>
      {vista === "editar" ? (
        <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_LOCAL} />
      ) : (
        <div className="space-y-3">
          {profesionales.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Previsualizar con</span>
              <select value={profesionalId} onChange={(e) => elegirProfesional(e.target.value)} className={INPUT_LOCAL}>
                <option value="">Datos de ejemplo genéricos</option>
                {profesionales.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--color-texto-mute)]">Color</span>
              <input
                type="color"
                value={overrides.profesional_color || "#6b2fa0"}
                onChange={(e) => setOverrides({ ...overrides, profesional_color: e.target.value })}
                className="h-9 w-full rounded border border-[var(--color-borde)] bg-transparent"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--color-texto-mute)]">Logo</span>
              <input value={overrides.profesional_logo} onChange={(e) => setOverrides({ ...overrides, profesional_logo: e.target.value })} className={INPUT_LOCAL} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--color-texto-mute)]">Facebook</span>
              <input value={overrides.profesional_facebook} onChange={(e) => setOverrides({ ...overrides, profesional_facebook: e.target.value })} className={INPUT_LOCAL} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--color-texto-mute)]">Instagram</span>
              <input value={overrides.profesional_instagram} onChange={(e) => setOverrides({ ...overrides, profesional_instagram: e.target.value })} className={INPUT_LOCAL} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--color-texto-mute)]">TikTok</span>
              <input value={overrides.profesional_tiktok} onChange={(e) => setOverrides({ ...overrides, profesional_tiktok: e.target.value })} className={INPUT_LOCAL} />
            </label>
          </div>
          <iframe
            srcDoc={renderizarPreview(value, overridesLimpios)}
            sandbox=""
            title="Vista previa del correo"
            className="h-96 w-full rounded-lg border border-[var(--color-borde)] bg-white"
          />
        </div>
      )}
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
  const [mostrarGenerador, setMostrarGenerador] = useState(false);
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

      {!plantilla && (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Empezar desde una plantilla predeterminada (opcional)</span>
          <div className="grid gap-3 sm:grid-cols-3">
            {PLANTILLAS_EMAIL_PREDETERMINADAS.map((p) => (
              <div key={p.id} className="rounded-lg border border-[var(--color-borde)] p-3 text-center">
                <p className="mb-2 text-xs font-medium text-[var(--color-texto)]">{p.nombre}</p>
                <button
                  type="button"
                  onClick={() => {
                    setAsunto(p.asunto);
                    setCuerpoHtml(p.cuerpo_html);
                    if (!nombre.trim()) setNombre(p.nombre);
                  }}
                  className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-2.5 py-1 text-xs font-medium text-[var(--color-texto)] hover:opacity-80"
                >
                  Usar esta
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--color-texto)]">Cuerpo (HTML)</span>
          <button
            type="button"
            onClick={() => setMostrarGenerador(true)}
            className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-2.5 py-1 text-xs font-medium text-[var(--color-texto)] hover:opacity-80"
          >
            ✨ Generar con IA
          </button>
        </div>
        <EditorHtmlConPreview value={cuerpoHtml} onChange={setCuerpoHtml} cuentaId={cuentaId} />
        <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
          Variables disponibles: {"{{nombre}}"}, {"{{correo_electronico}}"}
          {tipo !== "campana" && (
            <>
              {" "}
              , {"{{cita_fecha}}"}, {"{{cita_hora_inicio}}"}, {"{{profesional_nombre}}"}, {"{{tipo_cita}}"}, {"{{profesional_logo}}"}, {"{{profesional_color}}"},{" "}
              {"{{profesional_facebook}}"}, {"{{profesional_instagram}}"}, {"{{profesional_tiktok}}"}
            </>
          )}
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

      {mostrarGenerador && (
        <GeneradorPlantillaEmailModal
          tipo={tipo}
          cuentaId={cuentaId}
          onUsar={(generado) => {
            setAsunto(generado.asunto);
            setCuerpoHtml(generado.cuerpo_html);
            setMostrarGenerador(false);
          }}
          onCancelar={() => setMostrarGenerador(false)}
        />
      )}
    </div>
  );
}

function GeneradorPlantillaEmailModal({
  tipo,
  cuentaId,
  onUsar,
  onCancelar,
}: {
  tipo: "confirmacion_cita" | "reagendamiento_cita" | "cancelacion_cita" | "campana";
  cuentaId: string;
  onUsar: (generado: { asunto: string; cuerpo_html: string }) => void;
  onCancelar: () => void;
}) {
  const [descripcion, setDescripcion] = useState("");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<{ asunto: string; cuerpo_html: string } | null>(null);

  async function generar() {
    setGenerando(true);
    setError(null);
    const res = await fetch("/api/plantillas-email/generar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, descripcion }),
    });
    const data = await res.json().catch(() => ({}));
    setGenerando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo generar la plantilla");
      return;
    }
    setBorrador({ asunto: data.asunto, cuerpo_html: data.cuerpo_html });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <h2 className="mb-4 text-base font-semibold text-[var(--color-texto)]">Generar plantilla con IA</h2>

        {!borrador ? (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Describe cómo quieres el correo</span>
              <textarea
                rows={4}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej. Diseño moderno, colores azul y blanco, que incluya el logo y las redes sociales del profesional."
                className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
              />
            </label>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={generar}
                disabled={generando || !descripcion.trim()}
                style={{ boxShadow: "var(--halo-accion)" }}
                className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {generando ? "Generando…" : "Generar"}
              </button>
              <button onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Asunto</span>
              <input
                value={borrador.asunto}
                onChange={(e) => setBorrador({ ...borrador, asunto: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Cuerpo (HTML)</span>
              <EditorHtmlConPreview value={borrador.cuerpo_html} onChange={(v) => setBorrador({ ...borrador, cuerpo_html: v })} cuentaId={cuentaId} rows={10} />
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => onUsar(borrador)}
                style={{ boxShadow: "var(--halo-accion)" }}
                className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
              >
                Usar esto
              </button>
              <button onClick={() => setBorrador(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
                Volver
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
