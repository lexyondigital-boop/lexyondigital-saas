"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import { GeneradorCopyscriptModal } from "@/components/GeneradorCopyscriptModal";
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
} from "@/lib/plantillas-voz";
import {
  ETIQUETA_STATUS_LLAMADA,
  ETIQUETA_RESULTADO_LLAMADA,
  formatearDuracionLlamada,
  type StatusLlamadaVoz,
  type ResultadoLlamadaVoz,
} from "@/lib/llamadas-voz";

type Categoria = {
  valor: string;
  etiqueta: string;
  descripcion: string;
  disponible: boolean;
};

const CATEGORIAS: Categoria[] = [
  { valor: "legal", etiqueta: "Legal", descripcion: "Despachos y asesoría jurídica", disponible: true },
  { valor: "medicos", etiqueta: "Médicos", descripcion: "Consultorios y clínicas", disponible: true },
  { valor: "inmobiliario", etiqueta: "Inmobiliarios", descripcion: "Venta y renta de propiedades", disponible: true },
  { valor: "servicios", etiqueta: "Servicios", descripcion: "Agendamiento y atención a clientes", disponible: true },
  { valor: "cobranza", etiqueta: "Cobranza", descripcion: "Recordatorios y gestión de pagos", disponible: true },
  { valor: "ventas", etiqueta: "Ventas", descripcion: "Prospección y seguimiento comercial", disponible: true },
];

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
  retell_colgar_ivr: boolean;
  retell_pantalla_llamadas: boolean;
  retell_dtmf_activo: boolean;
  retell_dtmf_timeout_ms: number;
  retell_dtmf_clave_terminacion: string | null;
  retell_dtmf_limite_digitos: number | null;
  retell_fin_silencio_ms: number;
  retell_duracion_maxima_ms: number;
  retell_duracion_anillo_ms: number;
};

// Plantilla maestra de la cuenta master, tal como la ve una sub-cuenta al
// elegir un punto de partida para un agente nuevo -- mismos campos de
// configuración que PlantillaVozAgente, sin lo que es propio de un agente ya
// creado (publicada, modo_agente, retell_agent_id).
type PlantillaSemilla = {
  id: string;
  nombre: string;
  descripcion: string | null;
  numero_asignado?: string | null;
  agente_tipo: string;
  categoria: string;
  copyscript: string;
  objetivo: string | null;
  retell_voice_id: string | null;
  retell_idioma: string;
  retell_colgar_buzon: boolean;
  retell_colgar_ivr: boolean;
  retell_pantalla_llamadas: boolean;
  retell_dtmf_activo: boolean;
  retell_dtmf_timeout_ms: number;
  retell_dtmf_clave_terminacion: string | null;
  retell_dtmf_limite_digitos: number | null;
  retell_fin_silencio_ms: number;
  retell_duracion_maxima_ms: number;
  retell_duracion_anillo_ms: number;
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
        <CategoriaWorkspace categoria={categoria} onVolver={() => setCategoria(null)} permisos={permisos} />
      )}
    </div>
  );
}

function CategoriaWorkspace({
  categoria,
  onVolver,
  permisos,
}: {
  categoria: string;
  onVolver: () => void;
  permisos: Record<string, boolean>;
}) {
  const [llamadas, setLlamadas] = useState<Llamada[] | null>(null);
  const [transcripcionAbierta, setTranscripcionAbierta] = useState<Llamada | null>(null);

  useEffect(() => {
    setLlamadas(null);
    fetch(`/api/llamadas-voz?categoria=${categoria}`)
      .then((res) => res.json())
      .then((data) => setLlamadas(data.llamadas ?? []));
  }, [categoria]);

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

      {permisos.manage_plantillas_voz && <SeccionPlantillas categoria={categoria} />}

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
    </div>
  );
}

// Todo se crea y configura aquí (contenido + agente de Retell) -- Plantillas
// → Voz solo deja activar/desactivar los agentes ya creados.
function SeccionPlantillas({ categoria }: { categoria: string }) {
  const [plantillas, setPlantillas] = useState<PlantillaVozAgente[] | null>(null);
  const [editando, setEditando] = useState<PlantillaVozAgente | "nueva" | null>(null);
  const [semillaElegida, setSemillaElegida] = useState<PlantillaSemilla | null>(null);
  const [mostrarSelector, setMostrarSelector] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    const res = await fetch(`/api/plantillas-voz?categoria=${categoria}`);
    const data = await res.json().catch(() => ({}));
    setPlantillas(data.plantillas ?? []);
  }

  useEffect(() => {
    setPlantillas(null);
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoria]);

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
          onClick={() => setMostrarSelector(true)}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
        >
          Nuevo agente de voz
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {mostrarSelector && (
        <SelectorPlantillaMaestra
          categoria={categoria}
          onElegir={(semilla) => {
            setSemillaElegida(semilla);
            setEditando("nueva");
            setMostrarSelector(false);
          }}
          onCancelar={() => setMostrarSelector(false)}
        />
      )}

      {editando && (
        <FormularioAgenteVoz
          plantilla={editando === "nueva" ? null : editando}
          semilla={editando === "nueva" ? semillaElegida : null}
          categoriaWorkspace={categoria}
          onGuardado={() => {
            setEditando(null);
            setSemillaElegida(null);
            cargar();
          }}
          onCancelar={() => {
            setEditando(null);
            setSemillaElegida(null);
          }}
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
              {p.retell_agent_id && (
                <p className="mt-1 select-all font-mono text-[10px] text-[var(--color-texto-mute)]">{p.retell_agent_id}</p>
              )}
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

// Paso intermedio al crear un agente nuevo: elegir una plantilla maestra de
// la cuenta master como punto de partida (precarga el formulario, se puede
// editar todo después) o empezar en blanco, como ya funcionaba antes.
function SelectorPlantillaMaestra({
  categoria,
  onElegir,
  onCancelar,
}: {
  categoria: string;
  onElegir: (semilla: PlantillaSemilla | null) => void;
  onCancelar: () => void;
}) {
  const [plantillas, setPlantillas] = useState<PlantillaSemilla[] | null>(null);
  const [modoRetell, setModoRetell] = useState<"master" | "propia" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/plantillas-voz-maestras/disponibles?categoria=${categoria}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error ?? "No se pudieron cargar las plantillas maestras");
          return;
        }
        setPlantillas(data.plantillas ?? []);
        setModoRetell(data.modoRetell ?? null);
      })
      .catch(() => setError("No se pudieron cargar las plantillas maestras"));
  }, [categoria]);

  const esCuentaPropia = modoRetell === "propia";

  const porCategoria = new Map<string, PlantillaSemilla[]>();
  for (const p of plantillas ?? []) {
    porCategoria.set(p.categoria, [...(porCategoria.get(p.categoria) ?? []), p]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancelar}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-semibold text-[var(--color-texto)]">Elige un punto de partida</h2>
        <p className="mb-4 text-sm text-[var(--color-texto-mute)]">
          {esCuentaPropia
            ? "Puedes usar una plantilla ya lista y editarla después, o empezar completamente en blanco."
            : "Usas la cuenta incluida de lexyondigital -- solo puedes partir de una plantilla con número asignado."}
        </p>

        {esCuentaPropia && (
          <button
            onClick={() => onElegir(null)}
            className="mb-4 w-full rounded-xl border border-dashed border-[var(--color-borde)] p-4 text-left text-sm font-medium text-[var(--color-marca)] hover:border-[var(--color-marca)]"
          >
            + Empezar en blanco
          </button>
        )}

        {!esCuentaPropia && (
          <div className="mb-4 rounded-xl border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] p-4 text-sm text-[var(--color-texto)]">
            <p>
              Con la cuenta incluida, cada plantilla necesita un número asignado por tu administrador antes de poder
              usarla -- <strong>aplican cargos por uso</strong>.
            </p>
            <p className="mt-2 text-[var(--color-texto-mute)]">
              ¿Prefieres usar tu propia cuenta de Retell?{" "}
              <Link href="/configuracion" className="font-medium text-[var(--color-marca)] hover:underline">
                Conéctala en Configuración
              </Link>
              .
            </p>
          </div>
        )}

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        {plantillas === null ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : plantillas.length === 0 ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Todavía no hay plantillas maestras disponibles.</p>
        ) : (
          <div className="space-y-4">
            {[...porCategoria.entries()].map(([categoria, items]) => (
              <div key={categoria}>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-texto-mute)]">
                  {CATEGORIAS_VOZ.find((c) => c.valor === categoria)?.etiqueta ?? categoria}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((p) => {
                    const bloqueada = !esCuentaPropia && !p.numero_asignado;
                    return (
                      <button
                        key={p.id}
                        disabled={bloqueada}
                        onClick={() => !bloqueada && onElegir(p)}
                        className={
                          bloqueada
                            ? "cursor-not-allowed rounded-xl border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] p-4 text-left opacity-50"
                            : "rounded-xl border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] p-4 text-left hover:border-[var(--color-marca)]"
                        }
                      >
                        <p className="text-sm font-medium text-[var(--color-texto)]">{p.nombre}</p>
                        {p.descripcion && <p className="mt-1 text-xs text-[var(--color-texto-mute)]">{p.descripcion}</p>}
                        {!esCuentaPropia && (
                          <p className="mt-1 text-xs text-[var(--color-texto-mute)]">
                            {p.numero_asignado
                              ? `Se usará el número ${p.numero_asignado}`
                              : "Sin número asignado -- pide a tu administrador"}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <button onClick={onCancelar} className="mt-4 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function FormularioAgenteVoz({
  plantilla,
  semilla,
  categoriaWorkspace,
  onGuardado,
  onCancelar,
}: {
  plantilla: PlantillaVozAgente | null;
  semilla?: PlantillaSemilla | null;
  categoriaWorkspace: string;
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(plantilla?.nombre ?? semilla?.nombre ?? "");
  const [copyscript, setCopyscript] = useState(plantilla?.copyscript ?? semilla?.copyscript ?? "");
  const [objetivo, setObjetivo] = useState(plantilla?.objetivo ?? semilla?.objetivo ?? "");
  const [agenteTipo, setAgenteTipo] = useState(plantilla?.agente_tipo ?? semilla?.agente_tipo ?? "servicio");
  const [categoria, setCategoria] = useState(plantilla?.categoria ?? semilla?.categoria ?? categoriaWorkspace);
  const [modoAgente, setModoAgente] = useState<"generado" | "retell_propio">(plantilla?.modo_agente ?? "generado");
  const [retellAgentId, setRetellAgentId] = useState(plantilla?.retell_agent_id ?? "");
  const [retellVoiceId, setRetellVoiceId] = useState(plantilla?.retell_voice_id ?? semilla?.retell_voice_id ?? "");
  const [retellIdioma, setRetellIdioma] = useState(plantilla?.retell_idioma ?? semilla?.retell_idioma ?? "es-419");
  const [retellColgarBuzon, setRetellColgarBuzon] = useState(plantilla?.retell_colgar_buzon ?? semilla?.retell_colgar_buzon ?? true);
  const [retellColgarIvr, setRetellColgarIvr] = useState(plantilla?.retell_colgar_ivr ?? semilla?.retell_colgar_ivr ?? true);
  const [retellPantallaLlamadas, setRetellPantallaLlamadas] = useState(
    plantilla?.retell_pantalla_llamadas ?? semilla?.retell_pantalla_llamadas ?? false,
  );
  const [retellDtmfActivo, setRetellDtmfActivo] = useState(plantilla?.retell_dtmf_activo ?? semilla?.retell_dtmf_activo ?? false);
  const [retellDtmfTimeoutMs, setRetellDtmfTimeoutMs] = useState(plantilla?.retell_dtmf_timeout_ms ?? semilla?.retell_dtmf_timeout_ms ?? 2500);
  const [retellDtmfClaveTerminacion, setRetellDtmfClaveTerminacion] = useState<string | null>(
    plantilla?.retell_dtmf_clave_terminacion ?? semilla?.retell_dtmf_clave_terminacion ?? null,
  );
  const [retellDtmfLimiteDigitos, setRetellDtmfLimiteDigitos] = useState<number | null>(
    plantilla?.retell_dtmf_limite_digitos ?? semilla?.retell_dtmf_limite_digitos ?? null,
  );
  const [retellFinSilencioMs, setRetellFinSilencioMs] = useState(plantilla?.retell_fin_silencio_ms ?? semilla?.retell_fin_silencio_ms ?? 600000);
  const [retellDuracionMaximaMs, setRetellDuracionMaximaMs] = useState(
    plantilla?.retell_duracion_maxima_ms ?? semilla?.retell_duracion_maxima_ms ?? 3600000,
  );
  const [retellDuracionAnilloMs, setRetellDuracionAnilloMs] = useState(
    plantilla?.retell_duracion_anillo_ms ?? semilla?.retell_duracion_anillo_ms ?? 30000,
  );
  const [mostrarConfigLlamadas, setMostrarConfigLlamadas] = useState(false);
  const [funciones, setFunciones] = useState<FuncionRetell[]>(
    plantilla?.retell_funciones ??
      semilla?.retell_funciones ?? [{ type: "end_call", name: "fin_de_llamada", description: "Fin de la llamada" }],
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
    if (modoAgente === "generado" && retellPantallaLlamadas && !objetivo.trim()) {
      setError("Falta el objetivo para activar la gestión de pantalla de llamadas");
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
      ...(!plantilla && semilla?.id ? { plantilla_madre_id: semilla.id } : {}),
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
