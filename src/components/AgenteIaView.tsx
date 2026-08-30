"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { construirBloqueAgenda, type ProfesionalParaPrompt } from "@/lib/agente-prompt-agenda";
import { resolverVariablesDelPrompt, construirBloqueVariables } from "@/lib/agente-prompt-variables";
import { slugificarClaveVariable, type CampoPersonalizado } from "@/lib/campos-personalizados";

type Config = {
  nombre: string;
  activo: boolean;
  modo: "sugestivo" | "semi_automatico" | "automatico";
  proveedor_ia: "openai" | "claude";
  modo_api: "user_key" | "platform_key";
  api_key_usuario_cifrada: string | null;
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
  profesionales_ids: string[] | null;
};

const CONFIG_DEFECTO: Config = {
  nombre: "Agente",
  activo: true,
  modo: "sugestivo",
  proveedor_ia: "openai",
  modo_api: "platform_key",
  api_key_usuario_cifrada: null,
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
  profesionales_ids: null,
};

type Tab = "general" | "faqs" | "documentos" | "estadisticas";

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
          ["estadisticas", "Estadísticas"],
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
      {tab === "estadisticas" && <PestanaEstadisticas />}
    </div>
  );
}

function PestanaGeneral({ cuentaId }: { cuentaId: string }) {
  const supabase = createClient();
  const [config, setConfig] = useState<Config>(CONFIG_DEFECTO);
  const [triggerTexto, setTriggerTexto] = useState("");
  const [profesionales, setProfesionales] = useState<ProfesionalParaPrompt[]>([]);
  const [profesionalesSeleccionados, setProfesionalesSeleccionados] = useState<Set<string>>(new Set());
  const [camposPersonalizados, setCamposPersonalizados] = useState<CampoPersonalizado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [guardandoApiKey, setGuardandoApiKey] = useState(false);
  const [mensajeApiKey, setMensajeApiKey] = useState<string | null>(null);
  const [menuVariableAbierto, setMenuVariableAbierto] = useState(false);
  const [mostrarAsistente, setMostrarAsistente] = useState(false);
  const textareaPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const menuVariableRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (menuVariableRef.current && !menuVariableRef.current.contains(e.target as Node)) {
        setMenuVariableAbierto(false);
      }
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  useEffect(() => {
    (async () => {
      const [{ data: configData }, { data: profesionalesData }, { data: camposData }] = await Promise.all([
        supabase.from("agente_config").select("*").eq("cuenta_id", cuentaId).maybeSingle(),
        supabase
          .from("profesionales")
          .select("id, nombre, especialidad, horario_inicio, horario_fin, dias_disponibles, duracion_cita_minutos")
          .eq("cuenta_id", cuentaId)
          .eq("estado", "activo"),
        supabase.from("campos_personalizados").select("*").eq("cuenta_id", cuentaId),
      ]);

      const activos = profesionalesData ?? [];
      setProfesionales(activos);
      setCamposPersonalizados((camposData as CampoPersonalizado[]) ?? []);

      if (configData) {
        setConfig(configData);
        setTriggerTexto((configData.trigger_palabras ?? []).join(", "));
        // null = nunca se configuró explícitamente -- se muestra como "todos
        // marcados" para no dar la impresión de que el agente perdió acceso,
        // pero al guardar queda un arreglo explícito (ver guardar()).
        setProfesionalesSeleccionados(
          configData.profesionales_ids ? new Set(configData.profesionales_ids) : new Set(activos.map((p) => p.id)),
        );
      } else {
        setProfesionalesSeleccionados(new Set(activos.map((p) => p.id)));
      }

      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function alternarProfesional(id: string) {
    setProfesionalesSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function insertarVariable(clave: string) {
    const marcador = `{{${clave}}}`;
    const textarea = textareaPromptRef.current;
    const textoActual = config.prompt ?? "";

    if (!textarea) {
      setConfig((prev) => ({ ...prev, prompt: textoActual + marcador }));
      setMenuVariableAbierto(false);
      return;
    }

    const inicio = textarea.selectionStart ?? textoActual.length;
    const fin = textarea.selectionEnd ?? textoActual.length;
    const nuevoTexto = textoActual.slice(0, inicio) + marcador + textoActual.slice(fin);
    setConfig((prev) => ({ ...prev, prompt: nuevoTexto }));
    setMenuVariableAbierto(false);

    requestAnimationFrame(() => {
      textarea.focus();
      const posicion = inicio + marcador.length;
      textarea.setSelectionRange(posicion, posicion);
    });
  }

  async function guardarConfig() {
    setGuardando(true);
    setMensaje(null);

    const trigger_palabras = triggerTexto
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    // Al guardar siempre queda un arreglo explícito (aunque incluya a todos
    // los profesionales activos) -- así el selector deja de depender de un
    // "null implícito" en cuanto el admin lo toca una vez.
    const profesionales_ids = profesionales.length > 0 ? [...profesionalesSeleccionados] : null;

    const { error } = await supabase
      .from("agente_config")
      .upsert({ ...config, trigger_palabras, profesionales_ids, cuenta_id: cuentaId }, { onConflict: "cuenta_id" });

    setGuardando(false);
    setMensaje(error ? error.message : "Guardado.");
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    await guardarConfig();
  }

  async function guardarApiKey() {
    if (!apiKeyInput.trim()) return;
    setGuardandoApiKey(true);
    setMensajeApiKey(null);

    const res = await fetch("/api/agente-ia/api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKeyInput.trim() }),
    });

    setGuardandoApiKey(false);

    if (res.ok) {
      setConfig((prev) => ({ ...prev, api_key_usuario_cifrada: "•" }));
      setApiKeyInput("");
      setMensajeApiKey("API key guardada.");
    } else {
      const data = await res.json().catch(() => ({}));
      setMensajeApiKey(data.error ?? "No se pudo guardar la API key.");
    }
  }

  if (cargando) return <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>;

  return (
    <>
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
            <option value="automatico">Automático (responde solo, sin revisión)</option>
          </select>
          {config.modo !== "sugestivo" && (
            <span className="mt-1 block text-xs" style={{ color: "var(--color-aviso)" }}>
              El agente va a contestar directo a clientes reales por WhatsApp, sin que nadie revise antes.
            </span>
          )}
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

      <div className="rounded-xl border border-[var(--color-borde)] p-4">
        <span className="mb-1 block text-sm font-medium text-[var(--color-texto)]">Proveedor de IA</span>
        <p className="mb-3 text-xs text-[var(--color-texto-mute)]">
          Guarda este bloque en cuanto lo configures -- el asistente de prompt y las respuestas del agente usan lo último
          guardado aquí, no lo que se ve en la pantalla sin guardar.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Proveedor de IA</span>
            <select
              value={config.proveedor_ia}
              onChange={(e) => setConfig({ ...config, proveedor_ia: e.target.value as Config["proveedor_ia"] })}
              className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
            >
              <option value="openai">OpenAI</option>
              <option value="claude">Claude (Anthropic)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Modo de API</span>
            <select
              value={config.modo_api}
              onChange={(e) => setConfig({ ...config, modo_api: e.target.value as Config["modo_api"] })}
              className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
            >
              <option value="platform_key">Platform key (usa la API de Lexyondigital)</option>
              <option value="user_key">User key (tu propia API key)</option>
            </select>
          </label>

          {config.modo_api === "user_key" && (
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">
                API key de {config.proveedor_ia === "openai" ? "OpenAI" : "Claude"}
              </span>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={config.api_key_usuario_cifrada ? "Ya configurada — escribe una nueva para reemplazarla" : "sk-…"}
                  className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
                />
                <button
                  type="button"
                  onClick={guardarApiKey}
                  disabled={guardandoApiKey || !apiKeyInput.trim()}
                  className="shrink-0 rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80 disabled:opacity-50"
                >
                  {guardandoApiKey ? "Guardando…" : "Guardar key"}
                </button>
              </div>
              {mensajeApiKey && <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">{mensajeApiKey}</span>}
              <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
                Se guarda cifrada. Esta pantalla nunca vuelve a mostrarla en texto plano.
              </span>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-3 border-t border-[var(--color-borde)] pt-3">
          <button
            type="button"
            onClick={guardarConfig}
            disabled={guardando}
            style={{ boxShadow: "var(--halo-accion)" }}
            className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Guardar proveedor y modo de API"}
          </button>
          {mensaje && <span className="text-xs text-[var(--color-texto-mute)]">{mensaje}</span>}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-[var(--color-texto)]">Prompt / instrucciones</span>
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMostrarAsistente(true)}
            className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-2.5 py-1 text-xs font-medium text-[var(--color-texto)] hover:opacity-80"
          >
            ✨ Crear con asistente
          </button>
          <div className="relative" ref={menuVariableRef}>
            <button
              type="button"
              onClick={() => setMenuVariableAbierto((v) => !v)}
              className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-2.5 py-1 text-xs font-medium text-[var(--color-texto)] hover:opacity-80"
            >
              + Agregar variable
            </button>
            {menuVariableAbierto && (
              <div className="absolute right-0 z-10 mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] p-1 shadow-lg">
                {camposPersonalizados.filter((c) => c.clave_variable).length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-[var(--color-texto-mute)]">
                    Todavía no hay variables con clave definida. Créalas en <span className="font-medium">Variables</span>.
                  </p>
                ) : (
                  camposPersonalizados
                    .filter((c) => c.clave_variable)
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => insertarVariable(c.clave_variable as string)}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--color-tarjeta)]"
                      >
                        <span className="font-mono text-[var(--color-marca)]">{`{{${c.clave_variable}}}`}</span>
                        <span className="ml-1.5 text-[var(--color-texto-mute)]">{c.nombre}</span>
                      </button>
                    ))
                )}
              </div>
            )}
          </div>
          </div>
        </div>
        <textarea
          ref={textareaPromptRef}
          rows={5}
          value={config.prompt ?? ""}
          onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
      </div>

      {profesionales.length > 0 && (
        <div className="rounded-xl border border-[var(--color-borde)] p-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--color-texto)]">Profesionales que puede consultar y gestionar</span>
            <div className="flex gap-3 text-xs font-medium text-[var(--color-marca)]">
              <button type="button" onClick={() => setProfesionalesSeleccionados(new Set(profesionales.map((p) => p.id)))} className="hover:underline">
                Todos
              </button>
              <button type="button" onClick={() => setProfesionalesSeleccionados(new Set())} className="hover:underline">
                Ninguno
              </button>
            </div>
          </div>
          <p className="mb-3 text-xs text-[var(--color-texto-mute)]">
            El agente solo va a poder ver disponibilidad, agendar, reagendar o cancelar citas de los profesionales marcados aquí.
          </p>
          <div className="space-y-1.5">
            {profesionales.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-texto)]">
                <input type="checkbox" checked={profesionalesSeleccionados.has(p.id)} onChange={() => alternarProfesional(p.id)} />
                {p.nombre} — {p.especialidad}
              </label>
            ))}
          </div>

          <div className="mt-4 border-t border-[var(--color-borde)] pt-3">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--color-texto-mute)]">
              Vista previa -- esto se agrega automáticamente al prompt, no es editable
            </span>
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[var(--color-bg-elevada)] p-3 text-xs text-[var(--color-texto-mute)]">
              {construirBloqueAgenda(profesionales.filter((p) => profesionalesSeleccionados.has(p.id))) ??
                "Sin profesionales seleccionados -- el agente no va a poder tocar la agenda."}
            </pre>
          </div>
        </div>
      )}

      {(() => {
        const { usadas, noDefinidas } = resolverVariablesDelPrompt(config.prompt ?? "", camposPersonalizados);
        if (usadas.length === 0 && noDefinidas.length === 0) return null;
        return (
          <div className="rounded-xl border border-[var(--color-borde)] p-4">
            <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Variables detectadas en el prompt</span>
            {noDefinidas.length > 0 && (
              <p className="mb-2 text-xs" style={{ color: "var(--color-aviso)" }}>
                {`{{${noDefinidas.join("}}, {{")}}}`} — no {noDefinidas.length === 1 ? "está definida" : "están definidas"} en{" "}
                <span className="font-medium">Variables</span>. El agente no va a poder pedir ni guardar {noDefinidas.length === 1 ? "ese dato" : "esos datos"}.
              </p>
            )}
            {usadas.length > 0 && (
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[var(--color-bg-elevada)] p-3 text-xs text-[var(--color-texto-mute)]">
                {construirBloqueVariables(usadas)}
              </pre>
            )}
          </div>
        );
      })()}

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

    {mostrarAsistente && (
      <AsistentePromptModal
        camposPersonalizados={camposPersonalizados}
        onUsar={(prompt) => {
          setConfig((prev) => ({ ...prev, prompt }));
          setMostrarAsistente(false);
        }}
        onCerrar={() => setMostrarAsistente(false)}
      />
    )}
    </>
  );
}

function AsistentePromptModal({
  camposPersonalizados,
  onUsar,
  onCerrar,
}: {
  camposPersonalizados: CampoPersonalizado[];
  onUsar: (prompt: string) => void;
  onCerrar: () => void;
}) {
  const [rubro, setRubro] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [reglas, setReglas] = useState("");
  const [datos, setDatos] = useState<{ clave: string; etiqueta: string; esNueva: boolean }[]>([]);
  const [selectorValor, setSelectorValor] = useState("");
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<string | null>(null);
  const [costo, setCosto] = useState<number | null>(null);

  // El teléfono se excluye de "datos a capturar" -- ya se conoce desde que
  // el cliente escribe por WhatsApp, no tiene sentido pedírselo ni el agente
  // lo puede sobrescribir (ver agente-prompt-variables.ts).
  const variablesConClave = camposPersonalizados.filter((c) => c.clave_variable && c.mapea_a_columna_real !== "telefono");
  const variablesDisponibles = variablesConClave.filter(
    (c) => !datos.some((d) => d.clave === c.clave_variable),
  );

  function agregarDato() {
    if (selectorValor === "__nueva__") {
      const etiqueta = nuevaEtiqueta.trim();
      if (!etiqueta) return;
      const clavesOcupadas = new Set([
        ...camposPersonalizados.map((c) => c.clave_variable).filter(Boolean),
        ...datos.map((d) => d.clave),
      ] as string[]);
      let clave = slugificarClaveVariable(etiqueta);
      let sufijo = 2;
      while (!clave || clavesOcupadas.has(clave)) {
        clave = `${slugificarClaveVariable(etiqueta)}_${sufijo}`;
        sufijo++;
      }
      setDatos((prev) => [...prev, { clave, etiqueta, esNueva: true }]);
      setNuevaEtiqueta("");
      setSelectorValor("");
      return;
    }

    if (!selectorValor) return;
    const campo = variablesConClave.find((c) => c.clave_variable === selectorValor);
    if (!campo) return;
    setDatos((prev) => [...prev, { clave: campo.clave_variable as string, etiqueta: campo.nombre, esNueva: false }]);
    setSelectorValor("");
  }

  function quitarDato(clave: string) {
    setDatos((prev) => prev.filter((d) => d.clave !== clave));
  }

  async function generar(e: FormEvent) {
    e.preventDefault();
    setGenerando(true);
    setError(null);

    const res = await fetch("/api/agente-ia/generar-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rubro,
        objetivo,
        reglas,
        claves_variables_existentes: datos.filter((d) => !d.esNueva).map((d) => d.clave),
        variables_nuevas: datos.filter((d) => d.esNueva).map((d) => d.etiqueta),
      }),
    });
    const data = await res.json();
    setGenerando(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo generar el prompt");
      return;
    }
    setBorrador(data.prompt);
    setCosto(data.costo_usd ?? null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-texto)]">Crear prompt con asistente de IA</h2>
          <button type="button" onClick={onCerrar} className="text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
            ✕
          </button>
        </div>

        {!borrador ? (
          <form onSubmit={generar} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">¿A qué se dedica el negocio?</span>
              <input
                required
                value={rubro}
                onChange={(e) => setRubro(e.target.value)}
                placeholder="Clínica dental, tienda de ropa, despacho de consultoría…"
                className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">¿Qué debe lograr el agente en la conversación?</span>
              <textarea
                required
                rows={2}
                value={objetivo}
                onChange={(e) => setObjetivo(e.target.value)}
                placeholder="Agendar citas, responder dudas de servicios y precios, tomar pedidos…"
                className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
              />
            </label>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">¿Qué datos debe capturar del cliente?</span>
              <div className="flex gap-2">
                <select
                  value={selectorValor}
                  onChange={(e) => setSelectorValor(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
                >
                  <option value="">Selecciona un dato…</option>
                  {variablesDisponibles.map((c) => (
                    <option key={c.id} value={c.clave_variable as string}>
                      {c.nombre}
                    </option>
                  ))}
                  <option value="__nueva__">+ Nueva variable (todavía no existe)…</option>
                </select>
                {selectorValor !== "__nueva__" && (
                  <button
                    type="button"
                    onClick={agregarDato}
                    disabled={!selectorValor}
                    className="shrink-0 rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80 disabled:opacity-50"
                  >
                    Agregar
                  </button>
                )}
              </div>

              {selectorValor === "__nueva__" && (
                <div className="mt-2 flex gap-2">
                  <input
                    autoFocus
                    value={nuevaEtiqueta}
                    onChange={(e) => setNuevaEtiqueta(e.target.value)}
                    placeholder="Nombre del dato, ej. Correo electrónico"
                    className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
                  />
                  <button
                    type="button"
                    onClick={agregarDato}
                    disabled={!nuevaEtiqueta.trim()}
                    className="shrink-0 rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80 disabled:opacity-50"
                  >
                    Agregar
                  </button>
                </div>
              )}

              {datos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {datos.map((d) => (
                    <span
                      key={d.clave}
                      className="flex items-center gap-1.5 rounded-full border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] py-1 pl-3 pr-2 text-xs text-[var(--color-texto)]"
                    >
                      {d.etiqueta}
                      {d.esNueva && <span className="text-[var(--color-texto-mute)]">(nueva)</span>}
                      <button
                        type="button"
                        onClick={() => quitarDato(d.clave)}
                        className="text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]"
                        aria-label={`Quitar ${d.etiqueta}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {datos.some((d) => d.esNueva) && (
                <span className="mt-1.5 block text-xs text-[var(--color-texto-mute)]">
                  Las marcadas "(nueva)" el asistente las va a usar como marcador en el prompt, pero después vas a tener que
                  crearlas en Variables para que el agente las pueda guardar de verdad.
                </span>
              )}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Reglas especiales (opcional)</span>
              <textarea
                rows={2}
                value={reglas}
                onChange={(e) => setReglas(e.target.value)}
                placeholder="Nunca dar precios exactos, siempre ofrecer hablar con un humano si preguntan por garantías…"
                className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
              />
            </label>

            {error && (
              <p className="text-sm" style={{ color: "var(--color-aviso)" }}>
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCerrar}
                className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-4 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={generando}
                style={{ boxShadow: "var(--halo-accion)" }}
                className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {generando ? "Generando…" : "Generar prompt"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <span className="block text-sm font-medium text-[var(--color-texto)]">Borrador generado</span>
            <textarea
              rows={10}
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
            />
            {costo !== null && <p className="text-xs text-[var(--color-texto-mute)]">Costo de esta generación: ${costo.toFixed(4)} USD</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBorrador(null)}
                className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-4 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80"
              >
                Volver a las preguntas
              </button>
              <button
                type="button"
                onClick={() => onUsar(borrador)}
                style={{ boxShadow: "var(--halo-accion)" }}
                className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
              >
                Usar este prompt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
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

type FilaUso = {
  id: string;
  created_at: string;
  proveedor: string;
  modalidad: string;
  tokens_total: number;
  costo_usd: number;
  contactos: { nombre: string | null } | { nombre: string | null }[] | null;
};

function nombreContactoDe(fila: FilaUso): string {
  const rel = Array.isArray(fila.contactos) ? fila.contactos[0] : fila.contactos;
  return rel?.nombre ?? "—";
}

function PestanaEstadisticas() {
  const supabase = createClient();
  const [filas, setFilas] = useState<FilaUso[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("agente_uso_ia")
        .select("id, created_at, proveedor, modalidad, tokens_total, costo_usd, contactos(nombre)")
        .order("created_at", { ascending: false })
        .limit(500);
      setFilas((data as unknown as FilaUso[]) ?? []);
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cargando) return <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>;

  const totalTokens = filas.reduce((s, f) => s + f.tokens_total, 0);
  const totalCosto = filas.reduce((s, f) => s + f.costo_usd, 0);

  const porDia = new Map<string, number>();
  for (const f of filas) {
    const dia = f.created_at.slice(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
  }
  const dias = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  const maxDia = Math.max(1, ...dias.map(([, n]) => n));

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
          <p className="text-sm text-[var(--color-texto-mute)]">Mensajes de IA (últimos 500)</p>
          <p className="mt-2 text-2xl font-bold text-[var(--color-texto)]">{filas.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
          <p className="text-sm text-[var(--color-texto-mute)]">Tokens totales</p>
          <p className="mt-2 text-2xl font-bold text-[var(--color-texto)]">{totalTokens.toLocaleString("es-MX")}</p>
        </div>
        <div className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
          <p className="text-sm text-[var(--color-texto-mute)]">Costo estimado</p>
          <p className="mt-2 text-2xl font-bold text-[var(--color-texto)]">${totalCosto.toFixed(4)} USD</p>
        </div>
      </div>

      {dias.length > 0 && (
        <div className="mt-6 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
          <h3 className="mb-3 text-sm font-semibold text-[var(--color-texto)]">Mensajes por día</h3>
          <div className="space-y-1.5">
            {dias.map(([dia, n]) => (
              <div key={dia} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 text-[var(--color-texto-mute)]">{dia.slice(5)}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-elevada)]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(n / maxDia) * 100}%`, background: "var(--color-ia)" }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-[var(--color-texto)]">{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)]">
        {filas.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-texto-mute)]">Todavía no hay uso registrado.</p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-borde)] text-xs uppercase tracking-wide text-[var(--color-texto-mute)]">
                <th className="px-5 py-3 font-medium">Fecha</th>
                <th className="px-5 py-3 font-medium">Contacto</th>
                <th className="px-5 py-3 font-medium">Modalidad</th>
                <th className="px-5 py-3 font-medium">Proveedor</th>
                <th className="px-5 py-3 font-medium">Costo</th>
              </tr>
            </thead>
            <tbody>
              {filas.slice(0, 100).map((f) => (
                <tr key={f.id} className="border-b border-[var(--color-borde)] last:border-0">
                  <td className="px-5 py-3.5 text-[var(--color-texto-mute)]">
                    {new Date(f.created_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-texto)]">{nombreContactoDe(f)}</td>
                  <td className="px-5 py-3.5 text-[var(--color-texto)]">
                    {f.modalidad === "sugestivo" ? "Sugestivo" : f.modalidad === "asistente_prompt" ? "Asistente de prompt" : "Automático"}
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-texto-mute)]">{f.proveedor}</td>
                  <td className="px-5 py-3.5 text-[var(--color-texto)]">${f.costo_usd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
