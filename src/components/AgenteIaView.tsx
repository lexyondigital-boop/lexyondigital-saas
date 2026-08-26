"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Config = {
  nombre: string;
  activo: boolean;
  modo: "sugestivo" | "semi_automatico" | "automatico";
  prompt: string | null;
  tono: string;
  idioma: string;
  max_mensajes: number;
  horario_inicio: string;
  horario_fin: string;
  mensaje_fuera_horario: string | null;
  mensaje_transferencia: string | null;
  trigger_palabras: string[];
  seguimiento_horas: number;
};

const CONFIG_DEFECTO: Config = {
  nombre: "Agente",
  activo: true,
  modo: "sugestivo",
  prompt: "",
  tono: "profesional",
  idioma: "es",
  max_mensajes: 10,
  horario_inicio: "08:00",
  horario_fin: "20:00",
  mensaje_fuera_horario: "",
  mensaje_transferencia: "",
  trigger_palabras: [],
  seguimiento_horas: 24,
};

type Tab = "general" | "faqs" | "documentos";

export function AgenteIaView({ cuentaId }: { cuentaId: string }) {
  const [tab, setTab] = useState<Tab>("general");

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--color-texto)]">Agente IA</h1>
      <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
        Configura cómo responde el agente en WhatsApp para esta cuenta.
      </p>

      <div className="mb-6 mt-5 flex gap-5 border-b border-[var(--color-borde)]">
        {([
          ["general", "General"],
          ["faqs", "Preguntas frecuentes"],
          ["documentos", "Documentos"],
        ] as [Tab, string][]).map(([valor, etiqueta]) => (
          <button
            key={valor}
            onClick={() => setTab(valor)}
            className="border-b-2 pb-2.5 text-sm font-medium transition-colors"
            style={{
              borderColor: tab === valor ? "var(--color-marca)" : "transparent",
              color: tab === valor ? "var(--color-texto)" : "var(--color-texto-mute)",
            }}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {tab === "general" && <PestanaGeneral cuentaId={cuentaId} />}
      {tab === "faqs" && <PestanaFaqs cuentaId={cuentaId} />}
      {tab === "documentos" && <PestanaDocumentos cuentaId={cuentaId} />}
    </div>
  );
}

function PestanaGeneral({ cuentaId }: { cuentaId: string }) {
  const supabase = createClient();
  const [config, setConfig] = useState<Config>(CONFIG_DEFECTO);
  const [triggerTexto, setTriggerTexto] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("agente_config").select("*").eq("cuenta_id", cuentaId).maybeSingle();
      if (data) {
        setConfig(data);
        setTriggerTexto((data.trigger_palabras ?? []).join(", "));
      }
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);

    const trigger_palabras = triggerTexto
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    const { error } = await supabase
      .from("agente_config")
      .upsert({ ...config, trigger_palabras, cuenta_id: cuentaId }, { onConflict: "cuenta_id" });

    setGuardando(false);
    setMensaje(error ? error.message : "Guardado.");
  }

  if (cargando) return <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>;

  return (
    <form onSubmit={guardar} className="max-w-2xl space-y-5 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-texto)]">
          <input
            type="checkbox"
            checked={config.activo}
            onChange={(e) => setConfig({ ...config, activo: e.target.checked })}
          />
          Agente activo
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nombre del agente</span>
          <input
            value={config.nombre}
            onChange={(e) => setConfig({ ...config, nombre: e.target.value })}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Modo</span>
          <select
            value={config.modo}
            onChange={(e) => setConfig({ ...config, modo: e.target.value as Config["modo"] })}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          >
            <option value="sugestivo">Sugestivo (sugiere, el agente humano aprueba)</option>
            <option value="semi_automatico">Semi-automático</option>
            <option value="automatico">Automático</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Tono</span>
          <input
            value={config.tono}
            onChange={(e) => setConfig({ ...config, tono: e.target.value })}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Idioma</span>
          <input
            value={config.idioma}
            onChange={(e) => setConfig({ ...config, idioma: e.target.value })}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Horario de inicio</span>
          <input
            type="time"
            value={config.horario_inicio}
            onChange={(e) => setConfig({ ...config, horario_inicio: e.target.value })}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Horario de fin</span>
          <input
            type="time"
            value={config.horario_fin}
            onChange={(e) => setConfig({ ...config, horario_fin: e.target.value })}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Máx. mensajes seguidos</span>
          <input
            type="number"
            min={1}
            value={config.max_mensajes}
            onChange={(e) => setConfig({ ...config, max_mensajes: Number(e.target.value) })}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Seguimiento (horas sin respuesta)</span>
          <input
            type="number"
            min={1}
            value={config.seguimiento_horas}
            onChange={(e) => setConfig({ ...config, seguimiento_horas: Number(e.target.value) })}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Prompt / instrucciones</span>
        <textarea
          rows={5}
          value={config.prompt ?? ""}
          onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Palabras que disparan transferencia a humano</span>
        <input
          value={triggerTexto}
          onChange={(e) => setTriggerTexto(e.target.value)}
          placeholder="asesor, humano, hablar con alguien"
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Mensaje fuera de horario</span>
        <textarea
          rows={2}
          value={config.mensaje_fuera_horario ?? ""}
          onChange={(e) => setConfig({ ...config, mensaje_fuera_horario: e.target.value })}
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Mensaje al transferir a humano</span>
        <textarea
          rows={2}
          value={config.mensaje_transferencia ?? ""}
          onChange={(e) => setConfig({ ...config, mensaje_transferencia: e.target.value })}
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
      </label>

      {mensaje && <p className="text-sm text-[var(--color-texto-mute)]">{mensaje}</p>}

      <button
        type="submit"
        disabled={guardando}
        style={{ boxShadow: "var(--halo-accion)" }}
        className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {guardando ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}

function PestanaFaqs({ cuentaId }: { cuentaId: string }) {
  const supabase = createClient();
  const [faqs, setFaqs] = useState<{ id: string; pregunta: string; respuesta: string }[]>([]);
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase.from("agente_faqs").select("id, pregunta, respuesta").order("created_at");
    setFaqs(data ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    if (!pregunta.trim() || !respuesta.trim()) return;
    await supabase.from("agente_faqs").insert({ cuenta_id: cuentaId, pregunta: pregunta.trim(), respuesta: respuesta.trim() });
    setPregunta("");
    setRespuesta("");
    cargar();
  }

  async function eliminar(id: string) {
    await supabase.from("agente_faqs").delete().eq("id", id);
    cargar();
  }

  return (
    <div className="max-w-2xl">
      <form onSubmit={agregar} className="mb-6 space-y-3 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Pregunta</span>
          <input
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Respuesta</span>
          <textarea
            rows={2}
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <button
          type="submit"
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
        >
          Agregar
        </button>
      </form>

      <div className="space-y-3">
        {cargando ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : faqs.length === 0 ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Todavía no hay preguntas frecuentes.</p>
        ) : (
          faqs.map((f) => (
            <div key={f.id} className="rounded-xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-[var(--color-texto)]">{f.pregunta}</p>
                <button onClick={() => eliminar(f.id)} className="shrink-0 text-xs font-medium text-red-500 hover:underline">
                  Eliminar
                </button>
              </div>
              <p className="mt-1 text-sm text-[var(--color-texto-mute)]">{f.respuesta}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PestanaDocumentos({ cuentaId }: { cuentaId: string }) {
  const supabase = createClient();
  const [documentos, setDocumentos] = useState<{ id: string; nombre_archivo: string; url: string; tipo: string | null }[]>([]);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [url, setUrl] = useState("");
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase.from("agente_documentos").select("id, nombre_archivo, url, tipo").order("created_at");
    setDocumentos(data ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    if (!nombreArchivo.trim() || !url.trim()) return;
    await supabase.from("agente_documentos").insert({ cuenta_id: cuentaId, nombre_archivo: nombreArchivo.trim(), url: url.trim() });
    setNombreArchivo("");
    setUrl("");
    cargar();
  }

  async function eliminar(id: string) {
    await supabase.from("agente_documentos").delete().eq("id", id);
    cargar();
  }

  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-xs text-[var(--color-texto-mute)]">
        Pega el link público de un documento (PDF, Google Doc, etc.) que el agente pueda usar como referencia. Todavía
        no hay carga de archivos directa.
      </p>

      <form onSubmit={agregar} className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
        <input
          value={nombreArchivo}
          onChange={(e) => setNombreArchivo(e.target.value)}
          placeholder="Nombre del documento"
          className="min-w-[180px] flex-1 rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="min-w-[220px] flex-[2] rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
        <button
          type="submit"
          style={{ boxShadow: "var(--halo-accion)" }}
          className="shrink-0 rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
        >
          Agregar
        </button>
      </form>

      <div className="space-y-2">
        {cargando ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : documentos.length === 0 ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Todavía no hay documentos.</p>
        ) : (
          documentos.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-4">
              <a href={d.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-[var(--color-marca)] hover:underline">
                {d.nombre_archivo}
              </a>
              <button onClick={() => eliminar(d.id)} className="text-xs font-medium text-red-500 hover:underline">
                Eliminar
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
