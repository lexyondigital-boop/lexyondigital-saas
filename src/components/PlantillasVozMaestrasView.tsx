"use client";

import { useEffect, useState } from "react";
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

type FuncionRetell = {
  type: string;
  name: string;
  description?: string;
  transfer_destination?: { type: "predefined"; number: string };
  transfer_option?: { type: "cold_transfer" };
};

type PlantillaMaestra = {
  id: string;
  nombre: string;
  descripcion: string | null;
  agente_tipo: string;
  categoria: string;
  copyscript: string;
  objetivo: string | null;
  status: "activa" | "deprecada";
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

type VozRetellLite = { voiceId: string; nombre: string; proveedor: string; acento: string | null; genero: string | null };

const OPCIONES_FUNCION: { type: string; etiqueta: string; disponible: boolean }[] = [
  { type: "end_call", etiqueta: "Fin de la llamada", disponible: true },
  { type: "transfer_call", etiqueta: "Transferencia de llamadas", disponible: true },
  { type: "press_digit", etiqueta: "Pulsar el dígito (IVR)", disponible: false },
  { type: "send_sms", etiqueta: "SMS durante la llamada", disponible: false },
  { type: "extract_dynamic_variable", etiqueta: "Extraer variable dinámica", disponible: false },
  { type: "custom", etiqueta: "Función personalizada", disponible: false },
];

// Plantillas maestras: blueprints de datos que la cuenta master crea una vez
// (Ventas, Legal, Médico...) y que las sub-cuentas ven como punto de partida
// al crear un agente de voz propio -- no son un agente real de Retell, así
// que aquí no hay modo/agente-propio ni número saliente, solo el contenido y
// la configuración que se copiarán al agente real de cada sub-cuenta.
export function PlantillasVozMaestrasView() {
  const [plantillas, setPlantillas] = useState<PlantillaMaestra[] | null>(null);
  const [editando, setEditando] = useState<PlantillaMaestra | "nueva" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    const res = await fetch("/api/plantillas-voz-maestras");
    const data = await res.json().catch(() => ({}));
    setPlantillas(data.plantillas ?? []);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function alternarStatus(p: PlantillaMaestra) {
    setError(null);
    const res = await fetch(`/api/plantillas-voz-maestras/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: p.status === "activa" ? "deprecada" : "activa" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo actualizar");
      return;
    }
    cargar();
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta plantilla maestra? Los agentes ya creados a partir de ella no se ven afectados.")) return;
    setError(null);
    const res = await fetch(`/api/plantillas-voz-maestras/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo eliminar");
      return;
    }
    cargar();
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--color-texto)]">Plantillas de Voz</h1>
      <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
        Plantillas base (Ventas, Legal, Médico…) que las sub-cuentas ven como punto de partida al crear su propio agente
        de voz. Qué plantilla ve cada sub-cuenta se controla desde su administración.
      </p>

      <div className="mt-6 mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--color-texto)]">Plantillas maestras</h2>
        <button
          onClick={() => setEditando("nueva")}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
        >
          Nueva plantilla maestra
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {editando && (
        <FormularioPlantillaMaestra
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
        <p className="text-sm text-[var(--color-texto-mute)]">Todavía no hay plantillas maestras creadas.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plantillas.map((p) => (
            <div key={p.id} className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-texto)]">{p.nombre}</h3>
                <Badge tono={p.status === "activa" ? "en-vivo" : "mute"}>{p.status === "activa" ? "Activa" : "Deprecada"}</Badge>
              </div>
              <p className="text-xs text-[var(--color-texto-mute)]">
                {AGENTES_TIPO_VOZ.find((a) => a.valor === p.agente_tipo)?.etiqueta ?? p.agente_tipo} ·{" "}
                {CATEGORIAS_VOZ.find((c) => c.valor === p.categoria)?.etiqueta ?? p.categoria}
              </p>
              {p.descripcion && <p className="mt-2 text-xs text-[var(--color-texto-mute)]">{p.descripcion}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--color-borde)] pt-3">
                <button onClick={() => setEditando(p)} className="text-xs font-medium text-[var(--color-marca)] hover:underline">
                  Editar
                </button>
                <button onClick={() => alternarStatus(p)} className="text-xs font-medium text-[var(--color-marca)] hover:underline">
                  {p.status === "activa" ? "Despublicar" : "Reactivar"}
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

function FormularioPlantillaMaestra({
  plantilla,
  onGuardado,
  onCancelar,
}: {
  plantilla: PlantillaMaestra | null;
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(plantilla?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(plantilla?.descripcion ?? "");
  const [copyscript, setCopyscript] = useState(plantilla?.copyscript ?? "");
  const [objetivo, setObjetivo] = useState(plantilla?.objetivo ?? "");
  const [agenteTipo, setAgenteTipo] = useState(plantilla?.agente_tipo ?? "servicio");
  const [categoria, setCategoria] = useState(plantilla?.categoria ?? "servicios");
  const [retellVoiceId, setRetellVoiceId] = useState(plantilla?.retell_voice_id ?? "");
  const [retellIdioma, setRetellIdioma] = useState(plantilla?.retell_idioma ?? "es-419");
  const [retellColgarBuzon, setRetellColgarBuzon] = useState(plantilla?.retell_colgar_buzon ?? true);
  const [retellColgarIvr, setRetellColgarIvr] = useState(plantilla?.retell_colgar_ivr ?? true);
  const [retellPantallaLlamadas, setRetellPantallaLlamadas] = useState(plantilla?.retell_pantalla_llamadas ?? false);
  const [retellDtmfActivo, setRetellDtmfActivo] = useState(plantilla?.retell_dtmf_activo ?? false);
  const [retellDtmfTimeoutMs, setRetellDtmfTimeoutMs] = useState(plantilla?.retell_dtmf_timeout_ms ?? 2500);
  const [retellDtmfClaveTerminacion, setRetellDtmfClaveTerminacion] = useState<string | null>(plantilla?.retell_dtmf_clave_terminacion ?? null);
  const [retellDtmfLimiteDigitos, setRetellDtmfLimiteDigitos] = useState<number | null>(plantilla?.retell_dtmf_limite_digitos ?? null);
  const [retellFinSilencioMs, setRetellFinSilencioMs] = useState(plantilla?.retell_fin_silencio_ms ?? 600000);
  const [retellDuracionMaximaMs, setRetellDuracionMaximaMs] = useState(plantilla?.retell_duracion_maxima_ms ?? 3600000);
  const [retellDuracionAnilloMs, setRetellDuracionAnilloMs] = useState(plantilla?.retell_duracion_anillo_ms ?? 30000);
  const [mostrarConfigLlamadas, setMostrarConfigLlamadas] = useState(false);
  const [funciones, setFunciones] = useState<FuncionRetell[]>(
    plantilla?.retell_funciones ?? [{ type: "end_call", name: "fin_de_llamada", description: "Fin de la llamada" }],
  );
  const [mostrarAgregarFuncion, setMostrarAgregarFuncion] = useState(false);
  const [agregandoTransferencia, setAgregandoTransferencia] = useState(false);
  const [numeroTransferencia, setNumeroTransferencia] = useState("");
  const [voces, setVoces] = useState<VozRetellLite[]>([]);
  const [cargandoVoces, setCargandoVoces] = useState(false);
  const [errorVoces, setErrorVoces] = useState<string | null>(null);
  const [mostrarGeneradorCopyscript, setMostrarGeneradorCopyscript] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const INPUT_LOCAL =
    "w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]";

  useEffect(() => {
    setCargandoVoces(true);
    setErrorVoces(null);
    fetch("/api/plantillas-voz-maestras/voces")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setErrorVoces(data.error ?? "No se pudo cargar la lista de voces");
          return;
        }
        setVoces(data.voces ?? []);
      })
      .catch(() => setErrorVoces("No se pudo cargar la lista de voces"))
      .finally(() => setCargandoVoces(false));
  }, []);

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
    if (!retellVoiceId) {
      setError("Falta elegir la voz del agente");
      return;
    }
    if (retellPantallaLlamadas && !objetivo.trim()) {
      setError("Falta el objetivo para activar la gestión de pantalla de llamadas");
      return;
    }
    setGuardando(true);
    setError(null);

    const body = {
      nombre,
      descripcion,
      copyscript,
      objetivo,
      agente_tipo: agenteTipo,
      categoria,
      retell_voice_id: retellVoiceId,
      retell_idioma: retellIdioma,
      retell_colgar_buzon: retellColgarBuzon,
      retell_colgar_ivr: retellColgarIvr,
      retell_pantalla_llamadas: retellPantallaLlamadas,
      retell_dtmf_activo: retellDtmfActivo,
      retell_dtmf_timeout_ms: retellDtmfTimeoutMs,
      retell_dtmf_clave_terminacion: retellDtmfClaveTerminacion,
      retell_dtmf_limite_digitos: retellDtmfLimiteDigitos,
      retell_fin_silencio_ms: retellFinSilencioMs,
      retell_duracion_maxima_ms: retellDuracionMaximaMs,
      retell_duracion_anillo_ms: retellDuracionAnilloMs,
      retell_funciones: funciones,
    };
    const res = plantilla
      ? await fetch(`/api/plantillas-voz-maestras/${plantilla.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await fetch("/api/plantillas-voz-maestras", {
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
    onGuardado();
  }

  return (
    <div className="mb-6 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT_LOCAL} placeholder="Ej. Ventas" />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Descripción (solo para referencia interna)</span>
          <input
            value={descripcion ?? ""}
            onChange={(e) => setDescripcion(e.target.value)}
            className={INPUT_LOCAL}
            placeholder="Ej. Agente de seguimiento post-venta"
          />
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
          <input value={objetivo ?? ""} onChange={(e) => setObjetivo(e.target.value)} className={INPUT_LOCAL} placeholder="Ej. Confirmar que el servicio sigue activo" />
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
          <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Voz del agente</span>
          <select value={retellVoiceId} onChange={(e) => setRetellVoiceId(e.target.value)} className={INPUT_LOCAL} disabled={cargandoVoces}>
            <option value="">{cargandoVoces ? "Cargando…" : "Elige una voz"}</option>
            {voces.map((v) => (
              <option key={v.voiceId} value={v.voiceId}>
                {v.nombre}
                {v.acento ? ` (${v.acento})` : ""}
              </option>
            ))}
          </select>
          {errorVoces && <p className="mt-1 text-xs text-red-500">{errorVoces}</p>}
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

        {error && <p className="text-sm text-red-500">{error}</p>}

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
