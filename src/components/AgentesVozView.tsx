"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/Badge";

type Categoria = {
  valor: string;
  etiqueta: string;
  descripcion: string;
  disponible: boolean;
};

const CATEGORIAS: Categoria[] = [
  { valor: "legal", etiqueta: "Legal", descripcion: "Despachos y asesoría jurídica", disponible: false },
  { valor: "medicos", etiqueta: "Médicos", descripcion: "Consultorios y clínicas", disponible: false },
  { valor: "inmobiliario", etiqueta: "Inmobiliarios", descripcion: "Venta y renta de propiedades", disponible: false },
  { valor: "servicios", etiqueta: "Servicios", descripcion: "Agendamiento y atención a clientes", disponible: true },
  { valor: "cobranza", etiqueta: "Cobranza", descripcion: "Recordatorios y gestión de pagos", disponible: false },
  { valor: "ventas", etiqueta: "Ventas", descripcion: "Prospección y seguimiento comercial", disponible: false },
];

type Llamada = {
  id: string;
  status: "en_progreso" | "completada" | "fallida" | "sin_respuesta";
  resultado: "acepto" | "rechazo" | "pendiente" | null;
  duracion_segundos: number | null;
  transcripcion: string | null;
  audio_url: string | null;
  created_at: string;
  contacto: { nombre: string | null; telefono: string } | null;
  plantilla: { nombre: string } | null;
};

const ETIQUETA_STATUS: Record<Llamada["status"], string> = {
  en_progreso: "En progreso",
  completada: "Completada",
  fallida: "Fallida",
  sin_respuesta: "Sin respuesta",
};

const ETIQUETA_RESULTADO: Record<NonNullable<Llamada["resultado"]>, string> = {
  acepto: "Aceptó",
  rechazo: "Rechazó",
  pendiente: "Pendiente",
};

function BadgeStatus({ status }: { status: Llamada["status"] }) {
  if (status === "completada") return <Badge tono="en-vivo">{ETIQUETA_STATUS[status]}</Badge>;
  if (status === "en_progreso") return <Badge tono="aviso">{ETIQUETA_STATUS[status]}</Badge>;
  return <span className="text-xs font-medium text-red-500">{ETIQUETA_STATUS[status]}</span>;
}

function BadgeResultado({ resultado }: { resultado: Llamada["resultado"] }) {
  if (!resultado || resultado === "pendiente") return <Badge tono="mute">{ETIQUETA_RESULTADO.pendiente}</Badge>;
  if (resultado === "acepto") return <Badge tono="en-vivo">{ETIQUETA_RESULTADO.acepto}</Badge>;
  return <span className="text-xs font-medium text-red-500">{ETIQUETA_RESULTADO.rechazo}</span>;
}

function formatearDuracion(segundos: number | null) {
  if (segundos === null) return "—";
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return `${min}:${seg.toString().padStart(2, "0")}`;
}

type FuncionRetell = { type: string; name: string; description?: string };

type PlantillaVozAgente = {
  id: string;
  nombre: string;
  publicada: boolean;
  modo_agente: "generado" | "retell_propio";
  retell_agent_id: string | null;
  retell_voice_id: string | null;
  retell_idioma: string;
  retell_colgar_buzon: boolean;
  retell_funciones: FuncionRetell[];
};

type AgenteRetellLite = { agentId: string; nombre: string };
type VozRetellLite = { voiceId: string; nombre: string; proveedor: string; acento: string | null; genero: string | null };

const IDIOMAS_VOZ: { valor: string; etiqueta: string }[] = [
  { valor: "es-419", etiqueta: "Español (Latinoamérica)" },
  { valor: "es-ES", etiqueta: "Español (España)" },
  { valor: "en-US", etiqueta: "Inglés (EE. UU.)" },
  { valor: "en-GB", etiqueta: "Inglés (Reino Unido)" },
  { valor: "pt-BR", etiqueta: "Portugués (Brasil)" },
  { valor: "fr-FR", etiqueta: "Francés" },
];

const OPCIONES_FUNCION: { type: string; etiqueta: string; disponible: boolean }[] = [
  { type: "end_call", etiqueta: "Fin de la llamada", disponible: true },
  { type: "transfer_call", etiqueta: "Transferencia de llamadas", disponible: false },
  { type: "press_digit", etiqueta: "Pulsar el dígito (IVR)", disponible: false },
  { type: "send_sms", etiqueta: "SMS durante la llamada", disponible: false },
  { type: "extract_dynamic_variable", etiqueta: "Extraer variable dinámica", disponible: false },
  { type: "custom", etiqueta: "Función personalizada", disponible: false },
];

export function AgentesVozView({ permisos }: { permisos: Record<string, boolean> }) {
  const [categoria, setCategoria] = useState<string | null>(null);

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--color-texto)]">Agentes de Voz</h1>
      <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
        Llamadas automatizadas con IA (Retell) organizadas por tipo de negocio.
      </p>

      {categoria === null ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIAS.map((c) => (
            <button
              key={c.valor}
              disabled={!c.disponible}
              onClick={() => c.disponible && setCategoria(c.valor)}
              className={
                c.disponible
                  ? "rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5 text-left transition-colors hover:border-[var(--color-marca)]"
                  : "cursor-not-allowed rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5 text-left opacity-50"
              }
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-texto)]">{c.etiqueta}</h3>
                {!c.disponible && <Badge tono="mute">Próximamente</Badge>}
              </div>
              <p className="text-xs text-[var(--color-texto-mute)]">{c.descripcion}</p>
            </button>
          ))}
        </div>
      ) : (
        <ServiciosWorkspace onVolver={() => setCategoria(null)} permisos={permisos} />
      )}
    </div>
  );
}

function ServiciosWorkspace({ onVolver, permisos }: { onVolver: () => void; permisos: Record<string, boolean> }) {
  const [llamadas, setLlamadas] = useState<Llamada[] | null>(null);
  const [transcripcionAbierta, setTranscripcionAbierta] = useState<Llamada | null>(null);

  useEffect(() => {
    fetch("/api/llamadas-voz")
      .then((res) => res.json())
      .then((data) => setLlamadas(data.llamadas ?? []));
  }, []);

  const stats = calcularStats(llamadas ?? []);

  return (
    <div className="mt-6">
      <button onClick={onVolver} className="mb-4 text-sm font-medium text-[var(--color-marca)] hover:underline">
        ← Volver a categorías
      </button>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { etiqueta: "Total de llamadas", valor: stats.total },
          { etiqueta: "En progreso", valor: stats.enProgreso },
          { etiqueta: "Completadas", valor: stats.completadas },
          { etiqueta: "Fallidas / sin respuesta", valor: stats.fallidas },
          { etiqueta: "Aceptó", valor: stats.acepto },
          { etiqueta: "Rechazó", valor: stats.rechazo },
          { etiqueta: "Duración promedio", valor: stats.duracionPromedio },
        ].map((t) => (
          <div key={t.etiqueta} className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
            <p className="text-sm text-[var(--color-texto-mute)]">{t.etiqueta}</p>
            <p className="mt-2 text-3xl font-bold text-[var(--color-texto)]">{t.valor}</p>
          </div>
        ))}
      </div>

      {permisos.manage_plantillas_voz && <SeccionPlantillas />}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)]">
        {llamadas === null ? (
          <p className="p-5 text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : llamadas.length === 0 ? (
          <p className="p-5 text-sm text-[var(--color-texto-mute)]">Todavía no se han hecho llamadas.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-borde)] text-xs text-[var(--color-texto-mute)]">
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Plantilla</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Resultado</th>
                <th className="px-4 py-3 font-medium">Duración</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Transcripción</th>
              </tr>
            </thead>
            <tbody>
              {llamadas.map((l) => (
                <tr key={l.id} className="border-b border-[var(--color-borde)] last:border-0">
                  <td className="px-4 py-3 text-[var(--color-texto)]">{l.contacto?.nombre || l.contacto?.telefono || "—"}</td>
                  <td className="px-4 py-3 text-[var(--color-texto-mute)]">{l.plantilla?.nombre ?? "—"}</td>
                  <td className="px-4 py-3">
                    <BadgeStatus status={l.status} />
                  </td>
                  <td className="px-4 py-3">
                    <BadgeResultado resultado={l.resultado} />
                  </td>
                  <td className="px-4 py-3 text-[var(--color-texto-mute)]">{formatearDuracion(l.duracion_segundos)}</td>
                  <td className="px-4 py-3 text-[var(--color-texto-mute)]">
                    {new Date(l.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3">
                    {l.transcripcion ? (
                      <button onClick={() => setTranscripcionAbierta(l)} className="text-xs font-medium text-[var(--color-marca)] hover:underline">
                        Ver
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--color-texto-mute)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {transcripcionAbierta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setTranscripcionAbierta(null)}>
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-base font-semibold text-[var(--color-texto)]">
              Transcripción — {transcripcionAbierta.contacto?.nombre || transcripcionAbierta.contacto?.telefono}
            </h2>
            <p className="whitespace-pre-wrap text-sm text-[var(--color-texto)]">{transcripcionAbierta.transcripcion}</p>
            {transcripcionAbierta.audio_url && (
              <audio className="mt-4 w-full" controls src={transcripcionAbierta.audio_url} />
            )}
            <button
              onClick={() => setTranscripcionAbierta(null)}
              className="mt-4 text-sm font-medium text-[var(--color-marca)] hover:underline"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// La configuración del agente de Retell (modo, voz/agente, idioma, buzón,
// funciones) y el activar/desactivar viven aquí, no en Plantillas -- el
// contenido (nombre, copyscript) se sigue editando en Plantillas → Voz.
function SeccionPlantillas() {
  const [plantillas, setPlantillas] = useState<PlantillaVozAgente[] | null>(null);
  const [configurando, setConfigurando] = useState<PlantillaVozAgente | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    const res = await fetch("/api/plantillas-voz?categoria=servicios");
    const data = await res.json().catch(() => ({}));
    setPlantillas(data.plantillas ?? []);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function alternarActiva(p: PlantillaVozAgente) {
    setError(null);
    const res = await fetch(`/api/plantillas-voz/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicada: !p.publicada }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo actualizar");
      return;
    }
    cargar();
  }

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-base font-semibold text-[var(--color-texto)]">Plantillas</h2>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {plantillas === null ? (
        <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
      ) : plantillas.length === 0 ? (
        <p className="text-sm text-[var(--color-texto-mute)]">
          Todavía no hay plantillas de voz -- créalas en Plantillas → Voz.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plantillas.map((p) => (
            <div key={p.id} className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-texto)]">{p.nombre}</h3>
                <Badge tono={p.publicada ? "en-vivo" : "mute"}>{p.publicada ? "Activa" : "Inactiva"}</Badge>
              </div>
              <p className="text-xs text-[var(--color-texto-mute)]">
                {p.modo_agente === "retell_propio" ? (
                  <Badge tono="marca">Agente propio de Retell</Badge>
                ) : p.retell_agent_id ? (
                  <Badge tono="en-vivo">Sincronizado con Retell</Badge>
                ) : (
                  <Badge tono="aviso">Sin sincronizar con Retell</Badge>
                )}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--color-borde)] pt-3">
                <button onClick={() => setConfigurando(p)} className="text-xs font-medium text-[var(--color-marca)] hover:underline">
                  Configurar
                </button>
                <button onClick={() => alternarActiva(p)} className="text-xs font-medium text-[var(--color-marca)] hover:underline">
                  {p.publicada ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {configurando && (
        <ConfigurarAgenteModal
          plantilla={configurando}
          onGuardado={() => {
            setConfigurando(null);
            cargar();
          }}
          onCancelar={() => setConfigurando(null)}
        />
      )}
    </div>
  );
}

function ConfigurarAgenteModal({
  plantilla,
  onGuardado,
  onCancelar,
}: {
  plantilla: PlantillaVozAgente;
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const [modoAgente, setModoAgente] = useState<"generado" | "retell_propio">(plantilla.modo_agente);
  const [retellAgentId, setRetellAgentId] = useState(plantilla.retell_agent_id ?? "");
  const [retellVoiceId, setRetellVoiceId] = useState(plantilla.retell_voice_id ?? "");
  const [retellIdioma, setRetellIdioma] = useState(plantilla.retell_idioma);
  const [retellColgarBuzon, setRetellColgarBuzon] = useState(plantilla.retell_colgar_buzon);
  const [funciones, setFunciones] = useState<FuncionRetell[]>(plantilla.retell_funciones ?? []);
  const [mostrarAgregarFuncion, setMostrarAgregarFuncion] = useState(false);
  const [agentes, setAgentes] = useState<AgenteRetellLite[]>([]);
  const [voces, setVoces] = useState<VozRetellLite[]>([]);
  const [cargandoOpciones, setCargandoOpciones] = useState(false);
  const [errorOpciones, setErrorOpciones] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisoRetell, setAvisoRetell] = useState<string | null>(null);

  const INPUT_LOCAL =
    "w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]";

  useEffect(() => {
    setCargandoOpciones(true);
    setErrorOpciones(null);
    const url = modoAgente === "retell_propio" ? "/api/integraciones/retell/agentes" : "/api/integraciones/retell/voces";
    fetch(url)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setErrorOpciones(data.error ?? "No se pudo cargar la lista de Retell");
          return;
        }
        if (modoAgente === "retell_propio") setAgentes(data.agentes ?? []);
        else setVoces(data.voces ?? []);
      })
      .catch(() => setErrorOpciones("No se pudo cargar la lista de Retell"))
      .finally(() => setCargandoOpciones(false));
  }, [modoAgente]);

  function agregarFuncion(type: string) {
    const opcion = OPCIONES_FUNCION.find((o) => o.type === type);
    if (!opcion) return;
    setFunciones((f) => [...f, { type, name: type === "end_call" ? "fin_de_llamada" : type, description: opcion.etiqueta }]);
    setMostrarAgregarFuncion(false);
  }

  function quitarFuncion(type: string) {
    setFunciones((f) => f.filter((fn) => fn.type !== type));
  }

  async function guardar() {
    if (modoAgente === "retell_propio" && !retellAgentId) {
      setError("Falta elegir el agente de Retell");
      return;
    }
    if (modoAgente === "generado" && !retellVoiceId) {
      setError("Falta elegir la voz del agente");
      return;
    }
    setGuardando(true);
    setError(null);
    setAvisoRetell(null);

    const res = await fetch(`/api/plantillas-voz/${plantilla.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modo_agente: modoAgente,
        retell_agent_id: modoAgente === "retell_propio" ? retellAgentId : undefined,
        retell_voice_id: modoAgente === "generado" ? retellVoiceId : undefined,
        retell_idioma: modoAgente === "generado" ? retellIdioma : undefined,
        retell_colgar_buzon: modoAgente === "generado" ? retellColgarBuzon : undefined,
        retell_funciones: modoAgente === "generado" ? funciones : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setGuardando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar");
      return;
    }
    if (data.avisoRetell) {
      setAvisoRetell(data.avisoRetell);
      return;
    }
    onGuardado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <h2 className="mb-4 text-base font-semibold text-[var(--color-texto)]">Configurar agente — {plantilla.nombre}</h2>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Modo del agente</span>
            <select value={modoAgente} onChange={(e) => setModoAgente(e.target.value as "generado" | "retell_propio")} className={INPUT_LOCAL}>
              <option value="generado">Generar automáticamente desde el Copyscript</option>
              <option value="retell_propio">Usar un agente que configuré en Retell</option>
            </select>
          </label>

          {modoAgente === "retell_propio" ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Agente de Retell</span>
              <select value={retellAgentId} onChange={(e) => setRetellAgentId(e.target.value)} className={INPUT_LOCAL} disabled={cargandoOpciones}>
                <option value="">{cargandoOpciones ? "Cargando…" : "Elige un agente"}</option>
                {agentes.map((a) => (
                  <option key={a.agentId} value={a.agentId}>
                    {a.nombre}
                  </option>
                ))}
              </select>
              {errorOpciones && <p className="mt-1 text-xs text-red-500">{errorOpciones}</p>}
            </label>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Voz del agente</span>
                <select value={retellVoiceId} onChange={(e) => setRetellVoiceId(e.target.value)} className={INPUT_LOCAL} disabled={cargandoOpciones}>
                  <option value="">{cargandoOpciones ? "Cargando…" : "Elige una voz"}</option>
                  {voces.map((v) => (
                    <option key={v.voiceId} value={v.voiceId}>
                      {v.nombre}
                      {v.acento ? ` (${v.acento})` : ""}
                    </option>
                  ))}
                </select>
                {errorOpciones && <p className="mt-1 text-xs text-red-500">{errorOpciones}</p>}
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Idioma del agente</span>
                  <select value={retellIdioma} onChange={(e) => setRetellIdioma(e.target.value)} className={INPUT_LOCAL}>
                    {IDIOMAS_VOZ.map((i) => (
                      <option key={i.valor} value={i.valor}>
                        {i.etiqueta}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-5 flex items-center gap-2 text-sm text-[var(--color-texto)]">
                  <input type="checkbox" checked={retellColgarBuzon} onChange={(e) => setRetellColgarBuzon(e.target.checked)} />
                  Colgar en buzón de voz
                </label>
              </div>

              <div>
                <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Funciones</span>
                <div className="flex flex-wrap gap-2">
                  {funciones.map((f) => (
                    <span
                      key={f.type}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-2.5 py-1 text-xs text-[var(--color-texto)]"
                    >
                      {OPCIONES_FUNCION.find((o) => o.type === f.type)?.etiqueta ?? f.name}
                      <button onClick={() => quitarFuncion(f.type)} className="text-[var(--color-texto-mute)] hover:text-red-500">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="relative mt-2 inline-block">
                  <button
                    type="button"
                    onClick={() => setMostrarAgregarFuncion((v) => !v)}
                    className="text-xs font-medium text-[var(--color-marca)] hover:underline"
                  >
                    + Agregar función
                  </button>
                  {mostrarAgregarFuncion && (
                    <div className="absolute z-10 mt-1 w-56 rounded-lg border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-1 shadow-lg">
                      {OPCIONES_FUNCION.map((op) => (
                        <button
                          key={op.type}
                          type="button"
                          disabled={!op.disponible || funciones.some((f) => f.type === op.type)}
                          onClick={() => agregarFuncion(op.type)}
                          className="block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--color-texto)] hover:bg-[var(--color-bg-elevada)] disabled:opacity-40"
                        >
                          {op.etiqueta}
                          {!op.disponible ? " (próximamente)" : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          {avisoRetell && <p className="text-sm text-[var(--color-aviso)]">No se sincronizó con Retell: {avisoRetell}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onCancelar} className="rounded-lg border border-[var(--color-borde)] px-4 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80">
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando}
              style={{ boxShadow: "var(--halo-accion)" }}
              className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function calcularStats(llamadas: Llamada[]) {
  const total = llamadas.length;
  const enProgreso = llamadas.filter((l) => l.status === "en_progreso").length;
  const completadas = llamadas.filter((l) => l.status === "completada").length;
  const fallidas = llamadas.filter((l) => l.status === "fallida" || l.status === "sin_respuesta").length;
  const acepto = llamadas.filter((l) => l.resultado === "acepto").length;
  const rechazo = llamadas.filter((l) => l.resultado === "rechazo").length;

  const conDuracion = llamadas.filter((l) => l.duracion_segundos !== null);
  const duracionPromedio =
    conDuracion.length === 0
      ? "—"
      : formatearDuracion(Math.round(conDuracion.reduce((s, l) => s + (l.duracion_segundos ?? 0), 0) / conDuracion.length));

  return { total, enProgreso, completadas, fallidas, acepto, rechazo, duracionPromedio };
}
