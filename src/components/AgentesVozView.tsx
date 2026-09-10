"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { GeneradorCopyscriptModal } from "@/components/GeneradorCopyscriptModal";
import { ReporteLlamadasRetell } from "@/components/ReporteLlamadasRetell";
import {
  AGENTES_TIPO_VOZ,
  CATEGORIAS_VOZ,
  IDIOMAS_VOZ,
  OPCIONES_DTMF_TIMEOUT,
  OPCIONES_DTMF_LIMITE_DIGITOS,
  OPCIONES_DTMF_CLAVE_TERMINACION,
  OPCIONES_FIN_SILENCIO,
  OPCIONES_DURACION_MAXIMA,
  OPCIONES_DURACION_ANILLO,
  OPCIONES_DURACION_ANILLO_TRANSFERENCIA,
  OPCIONES_ON_HOLD_MUSIC,
  OPCIONES_TRANSFER_TIMEOUT_AGENCIAL,
} from "@/lib/plantillas-voz";
import {
  ETIQUETA_STATUS_LLAMADA,
  ETIQUETA_RESULTADO_LLAMADA,
  formatearDuracionLlamada,
  type StatusLlamadaVoz,
  type ResultadoLlamadaVoz,
} from "@/lib/llamadas-voz";
import type { FuncionRetell, TransferOption, OnHoldMusic } from "@/lib/retell";

const INPUT_LOCAL =
  "w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]";

type Llamada = {
  id: string;
  status: StatusLlamadaVoz;
  resultado: ResultadoLlamadaVoz | null;
  duracion_segundos: number | null;
  transcripcion: string | null;
  audio_url: string | null;
  created_at: string;
  contacto: { nombre: string | null; telefono: string } | null;
  plantilla: { nombre: string; agente_tipo: string; categoria: string } | null;
};

function BadgeStatus({ status }: { status: Llamada["status"] }) {
  if (status === "completada") return <Badge tono="en-vivo">{ETIQUETA_STATUS_LLAMADA[status]}</Badge>;
  if (status === "en_progreso") return <Badge tono="aviso">{ETIQUETA_STATUS_LLAMADA[status]}</Badge>;
  if (status === "fallida") return <span className="text-xs font-medium text-red-500">{ETIQUETA_STATUS_LLAMADA[status]}</span>;
  return <Badge tono="mute">{ETIQUETA_STATUS_LLAMADA[status]}</Badge>;
}

function BadgeResultado({ resultado }: { resultado: Llamada["resultado"] }) {
  if (!resultado || resultado === "pendiente") return <Badge tono="mute">{ETIQUETA_RESULTADO_LLAMADA.pendiente}</Badge>;
  if (resultado === "acepto") return <Badge tono="en-vivo">{ETIQUETA_RESULTADO_LLAMADA.acepto}</Badge>;
  return <span className="text-xs font-medium text-red-500">{ETIQUETA_RESULTADO_LLAMADA.rechazo}</span>;
}

// "Alejandro IA/Servicio · Servicios" -- nombre del agente, tipo y categoría,
// para distinguir de un vistazo cuál de varios agentes hizo cada llamada.
function etiquetaPlantilla(plantilla: Llamada["plantilla"]): string {
  if (!plantilla) return "—";
  const tipo = AGENTES_TIPO_VOZ.find((a) => a.valor === plantilla.agente_tipo)?.etiqueta ?? plantilla.agente_tipo;
  const categoria = CATEGORIAS_VOZ.find((c) => c.valor === plantilla.categoria)?.etiqueta ?? plantilla.categoria;
  return `${plantilla.nombre}/${tipo} · ${categoria}`;
}

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
  retell_colgar_ivr: boolean;
  retell_pantalla_llamadas: boolean;
  retell_dtmf_activo: boolean;
  retell_dtmf_timeout_ms: number;
  retell_dtmf_clave_terminacion: string | null;
  retell_dtmf_limite_digitos: number | null;
  retell_fin_silencio_ms: number;
  retell_duracion_maxima_ms: number;
  retell_duracion_anillo_ms: number;
  retell_habla_primero: boolean;
  retell_mensaje_bienvenida: string | null;
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
  const [llamadas, setLlamadas] = useState<Llamada[] | null>(null);
  const [transcripcionAbierta, setTranscripcionAbierta] = useState<Llamada | null>(null);

  useEffect(() => {
    fetch("/api/llamadas-voz")
      .then((res) => res.json())
      .then((data) => setLlamadas(data.llamadas ?? []));
  }, []);

  const stats = calcularStats(llamadas ?? []);

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--color-texto)]">Agentes de Voz</h1>
      <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
        Llamadas automatizadas con IA (Retell) para esta cuenta.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { etiqueta: "Total de llamadas", valor: stats.total },
          { etiqueta: "En progreso", valor: stats.enProgreso },
          { etiqueta: "Completadas", valor: stats.completadas },
          { etiqueta: "Fallidas", valor: stats.fallidas },
          { etiqueta: "Buzón de voz", valor: stats.buzon },
          { etiqueta: "Rechazadas", valor: stats.rechazadas },
          { etiqueta: "No contestó", valor: stats.noContesto },
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

      {permisos.manage_plantillas_voz && <SeccionAgente />}

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
                  <td className="px-4 py-3 text-[var(--color-texto-mute)]">{etiquetaPlantilla(l.plantilla)}</td>
                  <td className="px-4 py-3">
                    <BadgeStatus status={l.status} />
                  </td>
                  <td className="px-4 py-3">
                    <BadgeResultado resultado={l.resultado} />
                  </td>
                  <td className="px-4 py-3 text-[var(--color-texto-mute)]">{formatearDuracionLlamada(l.duracion_segundos)}</td>
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

      <ReporteLlamadasRetell
        fetchUrl="/api/llamadas-voz/reporte-retell-cuenta"
        titulo="Reporte de Retell"
        descripcion="Datos en vivo directo de Retell para esta cuenta: estado, duración, costo y grabación de cada llamada."
      />
    </div>
  );
}

// Todo se crea y configura aquí (contenido + agente de Retell) -- Plantillas
// → Voz solo deja activar/desactivar el agente ya creado. Máximo un agente
// por sub-cuenta por ahora: si ya existe uno, se muestra su tarjeta en vez
// del botón de crear.
function SeccionAgente() {
  const [plantillas, setPlantillas] = useState<PlantillaVozAgente[] | null>(null);
  const [editando, setEditando] = useState<PlantillaVozAgente | "nueva" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    const res = await fetch("/api/plantillas-voz");
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

  const yaTieneAgente = (plantillas?.length ?? 0) > 0;

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--color-texto)]">Tu agente de voz</h2>
        {!yaTieneAgente && plantillas !== null && (
          <button
            onClick={() => setEditando("nueva")}
            style={{ boxShadow: "var(--halo-accion)" }}
            className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
          >
            Crear agente de voz
          </button>
        )}
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
        <p className="text-sm text-[var(--color-texto-mute)]">Todavía no tienes un agente de voz creado.</p>
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
              {p.retell_agent_id && (
                <p className="mt-1 select-all font-mono text-[10px] text-[var(--color-texto-mute)]">{p.retell_agent_id}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--color-borde)] pt-3">
                <button onClick={() => setEditando(p)} className="text-xs font-medium text-[var(--color-marca)] hover:underline">
                  Editar
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
  const [retellColgarIvr, setRetellColgarIvr] = useState(plantilla?.retell_colgar_ivr ?? true);
  const [retellPantallaLlamadas, setRetellPantallaLlamadas] = useState(plantilla?.retell_pantalla_llamadas ?? false);
  const [retellDtmfActivo, setRetellDtmfActivo] = useState(plantilla?.retell_dtmf_activo ?? false);
  const [retellDtmfTimeoutMs, setRetellDtmfTimeoutMs] = useState(plantilla?.retell_dtmf_timeout_ms ?? 2500);
  const [retellDtmfClaveTerminacion, setRetellDtmfClaveTerminacion] = useState<string | null>(
    plantilla?.retell_dtmf_clave_terminacion ?? null,
  );
  const [retellDtmfLimiteDigitos, setRetellDtmfLimiteDigitos] = useState<number | null>(
    plantilla?.retell_dtmf_limite_digitos ?? null,
  );
  const [retellFinSilencioMs, setRetellFinSilencioMs] = useState(plantilla?.retell_fin_silencio_ms ?? 600000);
  const [retellDuracionMaximaMs, setRetellDuracionMaximaMs] = useState(plantilla?.retell_duracion_maxima_ms ?? 3600000);
  const [retellDuracionAnilloMs, setRetellDuracionAnilloMs] = useState(plantilla?.retell_duracion_anillo_ms ?? 30000);
  const [retellHablaPrimero, setRetellHablaPrimero] = useState(plantilla?.retell_habla_primero ?? false);
  const [retellMensajeBienvenida, setRetellMensajeBienvenida] = useState(plantilla?.retell_mensaje_bienvenida ?? "");
  const [mostrarConfigLlamadas, setMostrarConfigLlamadas] = useState(false);
  const [funciones, setFunciones] = useState<FuncionRetell[]>(
    plantilla?.retell_funciones ?? [{ type: "end_call", name: "fin_de_llamada", description: "Fin de la llamada" }],
  );
  const [mostrarAgregarFuncion, setMostrarAgregarFuncion] = useState(false);
  const [transferModal, setTransferModal] = useState<FuncionRetell | "nueva" | null>(null);
  const [agentes, setAgentes] = useState<AgenteRetellLite[]>([]);
  const [voces, setVoces] = useState<VozRetellLite[]>([]);
  const [cargandoOpciones, setCargandoOpciones] = useState(false);
  const [errorOpciones, setErrorOpciones] = useState<string | null>(null);
  const [mostrarGeneradorCopyscript, setMostrarGeneradorCopyscript] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisoRetell, setAvisoRetell] = useState<string | null>(null);

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
      setTransferModal("nueva");
      setMostrarAgregarFuncion(false);
      return;
    }
    setFunciones((f) => [...f, { type, name: "fin_de_llamada", description: "Fin de la llamada" }]);
    setMostrarAgregarFuncion(false);
  }

  function guardarTransferencia(f: FuncionRetell) {
    setFunciones((prev) => [...prev.filter((fn) => fn.type !== "transfer_call"), f]);
    setTransferModal(null);
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
    if (modoAgente === "generado" && retellPantallaLlamadas && !objetivo.trim()) {
      setError("Falta el objetivo para activar la gestión de pantalla de llamadas");
      return;
    }
    if (modoAgente === "generado" && retellHablaPrimero && !retellMensajeBienvenida.trim()) {
      setError("Falta el mensaje de bienvenida para que la IA hable primero");
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
      retell_colgar_ivr: modoAgente === "generado" ? retellColgarIvr : undefined,
      retell_pantalla_llamadas: modoAgente === "generado" ? retellPantallaLlamadas : undefined,
      retell_dtmf_activo: modoAgente === "generado" ? retellDtmfActivo : undefined,
      retell_dtmf_timeout_ms: modoAgente === "generado" ? retellDtmfTimeoutMs : undefined,
      retell_dtmf_clave_terminacion: modoAgente === "generado" ? retellDtmfClaveTerminacion : undefined,
      retell_dtmf_limite_digitos: modoAgente === "generado" ? retellDtmfLimiteDigitos : undefined,
      retell_fin_silencio_ms: modoAgente === "generado" ? retellFinSilencioMs : undefined,
      retell_duracion_maxima_ms: modoAgente === "generado" ? retellDuracionMaximaMs : undefined,
      retell_duracion_anillo_ms: modoAgente === "generado" ? retellDuracionAnilloMs : undefined,
      retell_habla_primero: modoAgente === "generado" ? retellHablaPrimero : undefined,
      retell_mensaje_bienvenida: modoAgente === "generado" ? retellMensajeBienvenida : undefined,
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

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Mensaje de bienvenida</span>
              <select
                value={retellHablaPrimero ? "ia" : "usuario"}
                onChange={(e) => setRetellHablaPrimero(e.target.value === "ia")}
                className={INPUT_LOCAL}
              >
                <option value="usuario">El usuario habla primero</option>
                <option value="ia">La IA habla primero</option>
              </select>
              {retellHablaPrimero && (
                <textarea
                  value={retellMensajeBienvenida}
                  onChange={(e) => setRetellMensajeBienvenida(e.target.value)}
                  rows={2}
                  placeholder="Ej. Hola, te llamo de Totalplay para ofrecerte un beneficio."
                  className={`${INPUT_LOCAL} mt-2`}
                />
              )}
            </label>

            <div>
              <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Funciones</span>
              <div className="flex flex-wrap gap-2">
                {funciones.map((f) => (
                  <span
                    key={f.type}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-2.5 py-1 text-xs text-[var(--color-texto)]"
                  >
                    {f.type === "transfer_call" ? (
                      <button type="button" onClick={() => setTransferModal(f)} className="hover:underline">
                        {etiquetaTransferencia(f)}
                      </button>
                    ) : (
                      OPCIONES_FUNCION.find((o) => o.type === f.type)?.etiqueta ?? f.name
                    )}
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

            <div className="border-t border-[var(--color-borde)] pt-3">
              <button
                type="button"
                onClick={() => setMostrarConfigLlamadas((v) => !v)}
                className="flex w-full items-center justify-between text-left text-sm font-medium text-[var(--color-texto)]"
              >
                Configuración de llamadas
                <span className="text-[var(--color-texto-mute)]">{mostrarConfigLlamadas ? "︿" : "﹀"}</span>
              </button>

              {mostrarConfigLlamadas && (
                <div className="mt-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm text-[var(--color-texto)]">
                    <input type="checkbox" checked={retellColgarIvr} onChange={(e) => setRetellColgarIvr(e.target.checked)} />
                    Colgar si se detecta un sistema IVR
                  </label>

                  <div>
                    <label className="flex items-center gap-2 text-sm text-[var(--color-texto)]">
                      <input
                        type="checkbox"
                        checked={retellPantallaLlamadas}
                        onChange={(e) => setRetellPantallaLlamadas(e.target.checked)}
                        disabled={!objetivo.trim()}
                      />
                      Anunciar identidad en pantallas de llamadas (iOS/Android)
                    </label>
                    {!objetivo.trim() && (
                      <p className="ml-6 mt-0.5 text-xs text-[var(--color-texto-mute)]">Completa el objetivo para poder activarlo.</p>
                    )}
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm text-[var(--color-texto)]">
                      <input type="checkbox" checked={retellDtmfActivo} onChange={(e) => setRetellDtmfActivo(e.target.checked)} />
                      Detectar entrada del teclado (DTMF)
                    </label>

                    {retellDtmfActivo && (
                      <div className="ml-6 mt-2 space-y-2">
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Tiempo de espera</span>
                          <select
                            value={retellDtmfTimeoutMs}
                            onChange={(e) => setRetellDtmfTimeoutMs(Number(e.target.value))}
                            className={INPUT_LOCAL}
                          >
                            {OPCIONES_DTMF_TIMEOUT.map((o) => (
                              <option key={o.valor} value={o.valor}>
                                {o.etiqueta}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div>
                          <label className="flex items-center gap-2 text-sm text-[var(--color-texto)]">
                            <input
                              type="checkbox"
                              checked={retellDtmfClaveTerminacion !== null}
                              onChange={(e) => setRetellDtmfClaveTerminacion(e.target.checked ? OPCIONES_DTMF_CLAVE_TERMINACION[0].valor : null)}
                            />
                            Terminar con una tecla
                          </label>
                          {retellDtmfClaveTerminacion !== null && (
                            <select
                              value={retellDtmfClaveTerminacion}
                              onChange={(e) => setRetellDtmfClaveTerminacion(e.target.value)}
                              className={`${INPUT_LOCAL} mt-2 ml-6 w-auto`}
                            >
                              {OPCIONES_DTMF_CLAVE_TERMINACION.map((o) => (
                                <option key={o.valor} value={o.valor}>
                                  {o.etiqueta}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        <div>
                          <label className="flex items-center gap-2 text-sm text-[var(--color-texto)]">
                            <input
                              type="checkbox"
                              checked={retellDtmfLimiteDigitos !== null}
                              onChange={(e) => setRetellDtmfLimiteDigitos(e.target.checked ? OPCIONES_DTMF_LIMITE_DIGITOS[0].valor : null)}
                            />
                            Limitar cantidad de dígitos
                          </label>
                          {retellDtmfLimiteDigitos !== null && (
                            <select
                              value={retellDtmfLimiteDigitos}
                              onChange={(e) => setRetellDtmfLimiteDigitos(Number(e.target.value))}
                              className={`${INPUT_LOCAL} mt-2 ml-6 w-auto`}
                            >
                              {OPCIONES_DTMF_LIMITE_DIGITOS.map((o) => (
                                <option key={o.valor} value={o.valor}>
                                  {o.etiqueta}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Terminar tras silencio de</span>
                      <select value={retellFinSilencioMs} onChange={(e) => setRetellFinSilencioMs(Number(e.target.value))} className={INPUT_LOCAL}>
                        {OPCIONES_FIN_SILENCIO.map((o) => (
                          <option key={o.valor} value={o.valor}>
                            {o.etiqueta}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Duración máxima</span>
                      <select
                        value={retellDuracionMaximaMs}
                        onChange={(e) => setRetellDuracionMaximaMs(Number(e.target.value))}
                        className={INPUT_LOCAL}
                      >
                        {OPCIONES_DURACION_MAXIMA.map((o) => (
                          <option key={o.valor} value={o.valor}>
                            {o.etiqueta}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Duración del timbre</span>
                      <select
                        value={retellDuracionAnilloMs}
                        onChange={(e) => setRetellDuracionAnilloMs(Number(e.target.value))}
                        className={INPUT_LOCAL}
                      >
                        {OPCIONES_DURACION_ANILLO.map((o) => (
                          <option key={o.valor} value={o.valor}>
                            {o.etiqueta}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              )}
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

      {transferModal && (
        <FormularioTransferCall
          inicial={transferModal === "nueva" ? null : transferModal}
          onGuardar={guardarTransferencia}
          onCancelar={() => setTransferModal(null)}
        />
      )}
    </div>
  );
}

// "Transferencia de llamadas (fría) +525512345678" -- resumen de la pastilla
// en la lista de funciones.
function etiquetaTransferencia(f: FuncionRetell): string {
  const ETIQUETA_TIPO: Record<string, string> = {
    cold_transfer: "fría",
    warm_transfer: "cálida",
    agentic_warm_transfer: "cálida agencial",
  };
  const tipo = f.transfer_option?.type ? ETIQUETA_TIPO[f.transfer_option.type] : null;
  const numero = f.transfer_destination?.type === "predefined" ? f.transfer_destination.number : null;
  return `Transferencia de llamadas${tipo ? ` (${tipo})` : ""}${numero ? ` ${numero}` : ""}`;
}

type TransferFormState = {
  nombre: string;
  descripcion: string;
  numero: string;
  tipo: "cold_transfer" | "warm_transfer" | "agentic_warm_transfer";
  callerId: "agente" | "usuario";
  duracionAnilloMs: number;
  metodoSip: "sip_invite" | "sip_refer";
  encabezadosSip: { clave: string; valor: string }[];
  hablaMientrasEsperas: boolean;
  tipoMensajeEspera: "prompt" | "static_text";
  mensajeEspera: string;
  musicaEspera: OnHoldMusic;
  mensajeReceptor: string;
  agenteDestino: string;
  timeoutMs: number;
  accionTimeout: "bridge_transfer" | "cancel_transfer";
};

function estadoInicialTransferencia(f: FuncionRetell | null): TransferFormState {
  const opcion = f?.transfer_option;
  const conCallerId = opcion && "show_transferee_as_caller" in opcion ? opcion : undefined;
  const conAnillo = opcion && "transfer_ring_duration_ms" in opcion ? opcion : undefined;
  const conMusica = opcion && "on_hold_music" in opcion ? opcion : undefined;
  return {
    nombre: f?.name ?? "transferir_llamada",
    descripcion:
      f?.description ?? "Transfiere la llamada a un humano cuando el cliente lo pida o el agente no pueda resolver la solicitud.",
    numero: f?.transfer_destination?.type === "predefined" ? f.transfer_destination.number : "",
    tipo: opcion?.type ?? "cold_transfer",
    callerId: conCallerId?.show_transferee_as_caller ? "usuario" : "agente",
    duracionAnilloMs: conAnillo?.transfer_ring_duration_ms ?? 30000,
    metodoSip: (opcion?.type === "cold_transfer" && opcion.cold_transfer_mode) || "sip_invite",
    encabezadosSip: f?.custom_sip_headers
      ? Object.entries(f.custom_sip_headers).map(([clave, valor]) => ({ clave, valor }))
      : [],
    hablaMientrasEsperas: f?.speak_during_execution ?? false,
    tipoMensajeEspera: f?.execution_message_type ?? "static_text",
    mensajeEspera: f?.execution_message_description ?? "",
    musicaEspera: conMusica?.on_hold_music ?? "none",
    mensajeReceptor: (opcion?.type === "warm_transfer" && opcion.private_handoff_option?.message) || "",
    agenteDestino: (opcion?.type === "agentic_warm_transfer" && opcion.agentic_transfer_config.transfer_agent.agent_id) || "",
    timeoutMs: (opcion?.type === "agentic_warm_transfer" && opcion.agentic_transfer_config.transfer_timeout_ms) || 30000,
    accionTimeout: (opcion?.type === "agentic_warm_transfer" && opcion.agentic_transfer_config.action_on_timeout) || "bridge_transfer",
  };
}

function construirFuncionTransferCall(s: TransferFormState): FuncionRetell {
  const f: FuncionRetell = {
    type: "transfer_call",
    name: s.nombre.trim() || "transferir_llamada",
    description: s.descripcion.trim() || undefined,
    transfer_destination: { type: "predefined", number: s.numero.trim() },
  };

  if (s.tipo === "cold_transfer") {
    f.transfer_option = {
      type: "cold_transfer",
      show_transferee_as_caller: s.callerId === "usuario",
      cold_transfer_mode: s.metodoSip,
      transfer_ring_duration_ms: s.duracionAnilloMs,
    };
    const headers = s.encabezadosSip.filter((h) => h.clave.trim());
    if (headers.length > 0) {
      f.custom_sip_headers = Object.fromEntries(headers.map((h) => [h.clave.trim(), h.valor]));
    }
    if (s.hablaMientrasEsperas) {
      f.speak_during_execution = true;
      f.execution_message_type = s.tipoMensajeEspera;
      f.execution_message_description = s.mensajeEspera.trim();
    }
  } else if (s.tipo === "warm_transfer") {
    f.transfer_option = {
      type: "warm_transfer",
      show_transferee_as_caller: s.callerId === "usuario",
      transfer_ring_duration_ms: s.duracionAnilloMs,
      on_hold_music: s.musicaEspera,
      ...(s.mensajeReceptor.trim() ? { private_handoff_option: { type: "static_message", message: s.mensajeReceptor.trim() } } : {}),
    };
  } else {
    f.transfer_option = {
      type: "agentic_warm_transfer",
      on_hold_music: s.musicaEspera,
      agentic_transfer_config: {
        transfer_agent: { agent_id: s.agenteDestino },
        transfer_timeout_ms: s.timeoutMs,
        action_on_timeout: s.accionTimeout,
      },
    };
  }
  return f;
}

// Sub-formulario con todas las opciones reales de "Transferencia de llamada"
// de Retell -- se abre para crear una función nueva o para editar la
// existente (clic en su pastilla).
function FormularioTransferCall({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial: FuncionRetell | null;
  onGuardar: (f: FuncionRetell) => void;
  onCancelar: () => void;
}) {
  const [estado, setEstado] = useState<TransferFormState>(() => estadoInicialTransferencia(inicial));
  const [agentesDestino, setAgentesDestino] = useState<AgenteRetellLite[]>([]);
  const [cargandoAgentes, setCargandoAgentes] = useState(false);
  const [errorAgentes, setErrorAgentes] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (estado.tipo !== "agentic_warm_transfer" || agentesDestino.length > 0 || cargandoAgentes) return;
    setCargandoAgentes(true);
    fetch("/api/integraciones/retell/agentes")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setErrorAgentes(data.error ?? "No se pudo cargar la lista de agentes");
          return;
        }
        setAgentesDestino(data.agentes ?? []);
      })
      .catch(() => setErrorAgentes("No se pudo cargar la lista de agentes"))
      .finally(() => setCargandoAgentes(false));
  }, [estado.tipo, agentesDestino.length, cargandoAgentes]);

  function actualizarEncabezado(i: number, campo: "clave" | "valor", valor: string) {
    setEstado((s) => ({
      ...s,
      encabezadosSip: s.encabezadosSip.map((h, idx) => (idx === i ? { ...h, [campo]: valor } : h)),
    }));
  }

  function quitarEncabezado(i: number) {
    setEstado((s) => ({ ...s, encabezadosSip: s.encabezadosSip.filter((_, idx) => idx !== i) }));
  }

  function guardar() {
    if (!estado.numero.trim().startsWith("+")) {
      setError("El número de destino debe estar en formato E.164 (ej. +525512345678)");
      return;
    }
    if (estado.tipo === "agentic_warm_transfer" && !estado.agenteDestino) {
      setError("Falta elegir el agente destino");
      return;
    }
    if (estado.hablaMientrasEsperas && !estado.mensajeEspera.trim()) {
      setError('Falta el mensaje para "Habla mientras esperas"');
      return;
    }
    onGuardar(construirFuncionTransferCall(estado));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancelar}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-semibold text-[var(--color-texto)]">Transferencia de llamada</h2>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Nombre</span>
              <input value={estado.nombre} onChange={(e) => setEstado((s) => ({ ...s, nombre: e.target.value }))} className={INPUT_LOCAL} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Transferir a</span>
              <input
                value={estado.numero}
                onChange={(e) => setEstado((s) => ({ ...s, numero: e.target.value }))}
                placeholder="+525512345678"
                className={INPUT_LOCAL}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Descripción</span>
            <textarea
              value={estado.descripcion}
              onChange={(e) => setEstado((s) => ({ ...s, descripcion: e.target.value }))}
              rows={2}
              className={INPUT_LOCAL}
            />
          </label>

          <div>
            <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">¿Cómo debería gestionar la IA la transferencia?</span>
            <div className="space-y-1.5">
              {[
                { valor: "cold_transfer" as const, etiqueta: "Transferencia en frío", detalle: "Transferencia de IA inmediata" },
                { valor: "warm_transfer" as const, etiqueta: "Transferencia en caliente", detalle: "La IA le da instrucciones unidireccionales al agente" },
                { valor: "agentic_warm_transfer" as const, etiqueta: "Transferencia cálida agencial", detalle: "La IA mantiene una conversación bidireccional con el agente destino" },
              ].map((op) => (
                <label key={op.valor} className="flex items-start gap-2 text-sm text-[var(--color-texto)]">
                  <input
                    type="radio"
                    className="mt-0.5"
                    checked={estado.tipo === op.valor}
                    onChange={() => setEstado((s) => ({ ...s, tipo: op.valor }))}
                  />
                  <span>
                    {op.etiqueta}
                    <span className="block text-xs text-[var(--color-texto-mute)]">{op.detalle}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {(estado.tipo === "cold_transfer" || estado.tipo === "warm_transfer") && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Identificador de llamadas mostrado</span>
                <select
                  value={estado.callerId}
                  onChange={(e) => setEstado((s) => ({ ...s, callerId: e.target.value as "agente" | "usuario" }))}
                  className={INPUT_LOCAL}
                >
                  <option value="agente">Relata el número del agente</option>
                  <option value="usuario">Número de usuario</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Duración del timbre</span>
                <select
                  value={estado.duracionAnilloMs}
                  onChange={(e) => setEstado((s) => ({ ...s, duracionAnilloMs: Number(e.target.value) }))}
                  className={INPUT_LOCAL}
                >
                  {OPCIONES_DURACION_ANILLO_TRANSFERENCIA.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {estado.tipo === "cold_transfer" && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Método de transferencia SIP</span>
                <select
                  value={estado.metodoSip}
                  onChange={(e) => setEstado((s) => ({ ...s, metodoSip: e.target.value as "sip_invite" | "sip_refer" }))}
                  className={INPUT_LOCAL}
                >
                  <option value="sip_invite">Invitación SIP</option>
                  <option value="sip_refer">SIP REFER</option>
                </select>
              </label>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--color-texto-mute)]">Encabezados SIP personalizados</span>
                  <button
                    type="button"
                    onClick={() => setEstado((s) => ({ ...s, encabezadosSip: [...s.encabezadosSip, { clave: "", valor: "" }] }))}
                    className="text-xs font-medium text-[var(--color-marca)] hover:underline"
                  >
                    + Agregar
                  </button>
                </div>
                {estado.encabezadosSip.map((h, i) => (
                  <div key={i} className="mb-1.5 flex items-center gap-2">
                    <input
                      value={h.clave}
                      onChange={(e) => actualizarEncabezado(i, "clave", e.target.value)}
                      placeholder="Clave"
                      className={INPUT_LOCAL}
                    />
                    <input
                      value={h.valor}
                      onChange={(e) => actualizarEncabezado(i, "valor", e.target.value)}
                      placeholder="Valor"
                      className={INPUT_LOCAL}
                    />
                    <button type="button" onClick={() => quitarEncabezado(i)} className="shrink-0 text-[var(--color-texto-mute)] hover:text-red-500">
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-[var(--color-texto)]">
                  <input
                    type="checkbox"
                    checked={estado.hablaMientrasEsperas}
                    onChange={(e) => setEstado((s) => ({ ...s, hablaMientrasEsperas: e.target.checked }))}
                  />
                  Habla mientras esperas
                </label>
                {estado.hablaMientrasEsperas && (
                  <div className="ml-6 mt-2 space-y-2">
                    <div className="flex gap-2">
                      {[
                        { valor: "prompt" as const, etiqueta: "Inmediato" },
                        { valor: "static_text" as const, etiqueta: "Oración estática" },
                      ].map((op) => (
                        <button
                          key={op.valor}
                          type="button"
                          onClick={() => setEstado((s) => ({ ...s, tipoMensajeEspera: op.valor }))}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                            estado.tipoMensajeEspera === op.valor
                              ? "border-[var(--color-marca)] text-[var(--color-marca)]"
                              : "border-[var(--color-borde)] text-[var(--color-texto)]"
                          }`}
                        >
                          {op.etiqueta}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={estado.mensajeEspera}
                      onChange={(e) => setEstado((s) => ({ ...s, mensajeEspera: e.target.value }))}
                      rows={2}
                      placeholder={estado.tipoMensajeEspera === "prompt" ? "Ej. déjame buscarlo por ti" : "Frase exacta que se dirá"}
                      className={INPUT_LOCAL}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {estado.tipo === "warm_transfer" && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Música en espera</span>
                <select
                  value={estado.musicaEspera}
                  onChange={(e) => setEstado((s) => ({ ...s, musicaEspera: e.target.value as OnHoldMusic }))}
                  className={INPUT_LOCAL}
                >
                  {OPCIONES_ON_HOLD_MUSIC.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Mensaje para quien recibe la llamada</span>
                <textarea
                  value={estado.mensajeReceptor}
                  onChange={(e) => setEstado((s) => ({ ...s, mensajeReceptor: e.target.value }))}
                  rows={2}
                  placeholder="Ej. Te transfiero a un cliente que quiere confirmar su pago."
                  className={INPUT_LOCAL}
                />
              </label>
            </>
          )}

          {estado.tipo === "agentic_warm_transfer" && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Agente destino</span>
                <select
                  value={estado.agenteDestino}
                  onChange={(e) => setEstado((s) => ({ ...s, agenteDestino: e.target.value }))}
                  className={INPUT_LOCAL}
                  disabled={cargandoAgentes}
                >
                  <option value="">{cargandoAgentes ? "Cargando…" : "Elige un agente"}</option>
                  {agentesDestino.map((a) => (
                    <option key={a.agentId} value={a.agentId}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
                {errorAgentes && <p className="mt-1 text-xs text-red-500">{errorAgentes}</p>}
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Tiempo de espera</span>
                  <select
                    value={estado.timeoutMs}
                    onChange={(e) => setEstado((s) => ({ ...s, timeoutMs: Number(e.target.value) }))}
                    className={INPUT_LOCAL}
                  >
                    {OPCIONES_TRANSFER_TIMEOUT_AGENCIAL.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.etiqueta}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Música en espera</span>
                  <select
                    value={estado.musicaEspera}
                    onChange={(e) => setEstado((s) => ({ ...s, musicaEspera: e.target.value as OnHoldMusic }))}
                    className={INPUT_LOCAL}
                  >
                    {OPCIONES_ON_HOLD_MUSIC.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.etiqueta}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Acción al expirar el tiempo de espera</span>
                <div className="space-y-1.5">
                  {[
                    { valor: "bridge_transfer" as const, etiqueta: "Completar la transferencia de todos modos" },
                    { valor: "cancel_transfer" as const, etiqueta: "Cancelar la transferencia" },
                  ].map((op) => (
                    <label key={op.valor} className="flex items-center gap-2 text-sm text-[var(--color-texto)]">
                      <input
                        type="radio"
                        checked={estado.accionTimeout === op.valor}
                        onChange={() => setEstado((s) => ({ ...s, accionTimeout: op.valor }))}
                      />
                      {op.etiqueta}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onCancelar} className="rounded-lg border border-[var(--color-borde)] px-4 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80">
              Cancelar
            </button>
            <button
              onClick={guardar}
              style={{ boxShadow: "var(--halo-accion)" }}
              className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
            >
              Guardar
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
  const buzon = llamadas.filter((l) => l.status === "buzon").length;
  const rechazadas = llamadas.filter((l) => l.status === "rechazada").length;
  const noContesto = llamadas.filter((l) => l.status === "no_contesto").length;
  const acepto = llamadas.filter((l) => l.resultado === "acepto").length;
  const rechazo = llamadas.filter((l) => l.resultado === "rechazo").length;

  const conDuracion = llamadas.filter((l) => l.duracion_segundos !== null);
  const duracionPromedio =
    conDuracion.length === 0
      ? "—"
      : formatearDuracionLlamada(Math.round(conDuracion.reduce((s, l) => s + (l.duracion_segundos ?? 0), 0) / conDuracion.length));

  return { total, enProgreso, completadas, fallidas, buzon, rechazadas, noContesto, acepto, rechazo, duracionPromedio };
}
