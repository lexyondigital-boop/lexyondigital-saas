"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { AGENTES_TIPO_VOZ, CATEGORIAS_VOZ, IDIOMAS_VOZ } from "@/lib/plantillas-voz";

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

type FuncionRetell = {
  type: string;
  name: string;
  description?: string;
  transfer_destination?: { type: "predefined"; number: string };
  transfer_option?: { type: "cold_transfer" };
};

type PlantillaVozAgente = {
  id: string;
  nombre: string;
  copyscript: string;
  objetivo: string | null;
  agente_tipo: string;
  categoria: string;
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

const OPCIONES_FUNCION: { type: string; etiqueta: string; disponible: boolean }[] = [
  { type: "end_call", etiqueta: "Fin de la llamada", disponible: true },
  { type: "transfer_call", etiqueta: "Transferencia de llamadas", disponible: true },
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

// Todo se crea y configura aquí (contenido + agente de Retell) -- Plantillas
// → Voz solo deja activar/desactivar los agentes ya creados.
function SeccionPlantillas() {
  const [plantillas, setPlantillas] = useState<PlantillaVozAgente[] | null>(null);
  const [editando, setEditando] = useState<PlantillaVozAgente | "nueva" | null>(null);
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

  async function duplicar(id: string) {
    setError(null);
    const res = await fetch(`/api/plantillas-voz/${id}/duplicar`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo duplicar");
      return;
    }
    cargar();
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este agente de voz?")) return;
    setError(null);
    const res = await fetch(`/api/plantillas-voz/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo eliminar");
      return;
    }
    cargar();
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--color-texto)]">Plantillas</h2>
        <button
          onClick={() => setEditando("nueva")}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
        >
          Nuevo agente de voz
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {editando && (
        <FormularioAgenteVoz
          plantilla={editando === "nueva" ? null : editando}
          onGuardado={() => {
            setEditando(null);
            cargar();
          }}
          onCancelar={() => setEditando(null)}
        />
      )}

      {plantillas === null ? (
        <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
      ) : plantillas.length === 0 ? (
        <p className="text-sm text-[var(--color-texto-mute)]">Todavía no hay agentes de voz creados.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plantillas.map((p) => (
            <div key={p.id} className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-texto)]">{p.nombre}</h3>
                <Badge tono={p.publicada ? "en-vivo" : "mute"}>{p.publicada ? "Activa" : "Inactiva"}</Badge>
              </div>
              <p className="text-xs text-[var(--color-texto-mute)]">
                {AGENTES_TIPO_VOZ.find((a) => a.valor === p.agente_tipo)?.etiqueta ?? p.agente_tipo} ·{" "}
                {CATEGORIAS_VOZ.find((c) => c.valor === p.categoria)?.etiqueta ?? p.categoria}
              </p>
              <p className="mt-1">
                {p.modo_agente === "retell_propio" ? (
                  <Badge tono="marca">Agente propio de Retell</Badge>
                ) : p.retell_agent_id ? (
                  <Badge tono="en-vivo">Sincronizado con Retell</Badge>
                ) : (
                  <Badge tono="aviso">Sin sincronizar con Retell</Badge>
                )}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--color-borde)] pt-3">
                <button onClick={() => setEditando(p)} className="text-xs font-medium text-[var(--color-marca)] hover:underline">
                  Editar
                </button>
                <button onClick={() => duplicar(p.id)} className="text-xs font-medium text-[var(--color-marca)] hover:underline">
                  Duplicar
                </button>
                <button onClick={() => alternarActiva(p)} className="text-xs font-medium text-[var(--color-marca)] hover:underline">
                  {p.publicada ? "Desactivar" : "Activar"}
                </button>
                <button onClick={() => eliminar(p.id)} className="text-xs font-medium text-red-500 hover:underline">
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FormularioAgenteVoz({
  plantilla,
  onGuardado,
  onCancelar,
}: {
  plantilla: PlantillaVozAgente | null;
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(plantilla?.nombre ?? "");
  const [copyscript, setCopyscript] = useState(plantilla?.copyscript ?? "");
  const [objetivo, setObjetivo] = useState(plantilla?.objetivo ?? "");
  const [agenteTipo, setAgenteTipo] = useState(plantilla?.agente_tipo ?? "servicio");
  const [categoria, setCategoria] = useState(plantilla?.categoria ?? "servicios");
  const [modoAgente, setModoAgente] = useState<"generado" | "retell_propio">(plantilla?.modo_agente ?? "generado");
  const [retellAgentId, setRetellAgentId] = useState(plantilla?.retell_agent_id ?? "");
  const [retellVoiceId, setRetellVoiceId] = useState(plantilla?.retell_voice_id ?? "");
  const [retellIdioma, setRetellIdioma] = useState(plantilla?.retell_idioma ?? "es-419");
  const [retellColgarBuzon, setRetellColgarBuzon] = useState(plantilla?.retell_colgar_buzon ?? true);
  const [funciones, setFunciones] = useState<FuncionRetell[]>(
    plantilla?.retell_funciones ?? [{ type: "end_call", name: "fin_de_llamada", description: "Fin de la llamada" }],
  );
  const [mostrarAgregarFuncion, setMostrarAgregarFuncion] = useState(false);
  const [agregandoTransferencia, setAgregandoTransferencia] = useState(false);
  const [numeroTransferencia, setNumeroTransferencia] = useState("");
  const [agentes, setAgentes] = useState<AgenteRetellLite[]>([]);
  const [voces, setVoces] = useState<VozRetellLite[]>([]);
  const [cargandoOpciones, setCargandoOpciones] = useState(false);
  const [errorOpciones, setErrorOpciones] = useState<string | null>(null);
  const [mostrarGeneradorCopyscript, setMostrarGeneradorCopyscript] = useState(false);
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

  function elegirOpcionFuncion(type: string) {
    if (type === "transfer_call") {
      setAgregandoTransferencia(true);
      setMostrarAgregarFuncion(false);
      return;
    }
    setFunciones((f) => [...f, { type, name: "fin_de_llamada", description: "Fin de la llamada" }]);
    setMostrarAgregarFuncion(false);
  }

  function confirmarTransferencia() {
    if (!numeroTransferencia.trim().startsWith("+")) return;
    setFunciones((f) => [
      ...f,
      {
        type: "transfer_call",
        name: "transferir_llamada",
        description: "Transfiere la llamada a un humano cuando el cliente lo pida o el agente no pueda resolver la solicitud.",
        transfer_destination: { type: "predefined", number: numeroTransferencia.trim() },
        transfer_option: { type: "cold_transfer" },
      },
    ]);
    setNumeroTransferencia("");
    setAgregandoTransferencia(false);
  }

  function quitarFuncion(type: string) {
    setFunciones((f) => f.filter((fn) => fn.type !== type));
  }

  async function guardar() {
    if (!nombre.trim()) {
      setError("Falta el nombre");
      return;
    }
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

    const body = {
      nombre,
      copyscript,
      objetivo,
      agente_tipo: agenteTipo,
      categoria,
      modo_agente: modoAgente,
      retell_agent_id: modoAgente === "retell_propio" ? retellAgentId : undefined,
      retell_voice_id: modoAgente === "generado" ? retellVoiceId : undefined,
      retell_idioma: modoAgente === "generado" ? retellIdioma : undefined,
      retell_colgar_buzon: modoAgente === "generado" ? retellColgarBuzon : undefined,
      retell_funciones: modoAgente === "generado" ? funciones : undefined,
    };
    const res = plantilla
      ? await fetch(`/api/plantillas-voz/${plantilla.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await fetch("/api/plantillas-voz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
    <div className="mb-6 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT_LOCAL} />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Tipo de agente</span>
            <select value={agenteTipo} onChange={(e) => setAgenteTipo(e.target.value)} className={INPUT_LOCAL}>
              {AGENTES_TIPO_VOZ.map((a) => (
                <option key={a.valor} value={a.valor} disabled={!a.disponible}>
                  {a.etiqueta}
                  {!a.disponible ? " (próximamente)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Categoría</span>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={INPUT_LOCAL}>
              {CATEGORIAS_VOZ.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Objetivo</span>
          <input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} className={INPUT_LOCAL} placeholder="Ej. Confirmar que el servicio sigue activo" />
        </label>

        <label className="block">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--color-texto-mute)]">Copyscript</span>
            <button type="button" onClick={() => setMostrarGeneradorCopyscript(true)} className="text-xs font-medium text-[var(--color-marca)] hover:underline">
              ✨ Generar con IA
            </button>
          </div>
          <textarea value={copyscript} onChange={(e) => setCopyscript(e.target.value)} rows={8} className={INPUT_LOCAL} />
        </label>

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
                    {f.type === "transfer_call" && f.transfer_destination ? ` (${f.transfer_destination.number})` : ""}
                    <button onClick={() => quitarFuncion(f.type)} className="text-[var(--color-texto-mute)] hover:text-red-500">
                      ×
                    </button>
                  </span>
                ))}
              </div>

              {agregandoTransferencia && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={numeroTransferencia}
                    onChange={(e) => setNumeroTransferencia(e.target.value)}
                    placeholder="+525512345678"
                    className={INPUT_LOCAL}
                  />
                  <button
                    type="button"
                    onClick={confirmarTransferencia}
                    disabled={!numeroTransferencia.trim().startsWith("+")}
                    className="shrink-0 rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-xs font-medium text-[var(--color-texto)] hover:opacity-80 disabled:opacity-50"
                  >
                    Agregar
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgregandoTransferencia(false)}
                    className="shrink-0 text-xs font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]"
                  >
                    Cancelar
                  </button>
                </div>
              )}

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
                        onClick={() => elegirOpcionFuncion(op.type)}
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

      {mostrarGeneradorCopyscript && (
        <GeneradorCopyscriptModal
          categoria={categoria}
          objetivo={objetivo}
          onUsar={(texto) => {
            setCopyscript(texto);
            setMostrarGeneradorCopyscript(false);
          }}
          onCancelar={() => setMostrarGeneradorCopyscript(false)}
        />
      )}
    </div>
  );
}

function GeneradorCopyscriptModal({
  categoria,
  objetivo,
  onUsar,
  onCancelar,
}: {
  categoria: string;
  objetivo: string;
  onUsar: (copyscript: string) => void;
  onCancelar: () => void;
}) {
  const [descripcion, setDescripcion] = useState("");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<string | null>(null);

  async function generar() {
    setGenerando(true);
    setError(null);
    const res = await fetch("/api/plantillas-voz/sugerir-copyscript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoria, objetivo, descripcion }),
    });
    const data = await res.json().catch(() => ({}));
    setGenerando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo generar el copyscript");
      return;
    }
    setBorrador(data.copyscript);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <h2 className="mb-4 text-base font-semibold text-[var(--color-texto)]">Generar copyscript con IA</h2>

        {!borrador ? (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Describe qué debe hacer el agente en la llamada</span>
              <textarea
                rows={4}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej. Llamar a clientes para confirmar que siguen usando el servicio de fumigación y ofrecer renovar el contrato anual."
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
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Copyscript</span>
              <textarea
                rows={12}
                value={borrador}
                onChange={(e) => setBorrador(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
              />
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
