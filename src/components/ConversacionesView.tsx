"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/Badge";

type ConversacionCruda = {
  id: string;
  telefono: string;
  status: "abierta" | "cerrada";
  agente_ia_activo: boolean;
  contacto_id: string;
  created_at: string;
  contactos: { nombre: string | null } | { nombre: string | null }[] | null;
};

type Conversacion = {
  id: string;
  telefono: string;
  status: "abierta" | "cerrada";
  agente_ia_activo: boolean;
  contacto_id: string;
  created_at: string;
  nombreContacto: string | null;
};

type Mensaje = {
  id: string;
  direccion: "entrante" | "saliente";
  tipo: string;
  contenido: string | null;
  media_url: string | null;
  template_nombre: string | null;
  status: string;
  created_at: string;
  sugerencia_ia: string | null;
  sugerencia_usada: boolean;
  feedback_ia: "positivo" | "negativo" | null;
};

function nombreDe(c: ConversacionCruda): string | null {
  const rel = Array.isArray(c.contactos) ? c.contactos[0] : c.contactos;
  return rel?.nombre ?? null;
}

// Palomitas estilo WhatsApp: una gris (enviado), dos grises (entregado), dos
// azules (leído), o un aviso rojo (fallido). El estado real se actualiza vía
// los eventos "statuses" del webhook, no es solo cosmético.
function IconoEstadoMensaje({ status }: { status: string }) {
  if (status === "fallido") {
    return (
      <span title="No se pudo entregar" className="text-red-300">
        ⚠
      </span>
    );
  }

  if (status !== "entregado" && status !== "leido") {
    return (
      <svg width="14" height="10" viewBox="0 0 16 11" fill="none" aria-label="Enviado">
        <path d="M1 5.5 5 9.5 15 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      </svg>
    );
  }

  return (
    <svg width="18" height="10" viewBox="0 0 20 11" fill="none" aria-label={status === "leido" ? "Leído" : "Entregado"}>
      <path
        d="M1 5.5 5 9.5 15 1"
        stroke={status === "leido" ? "#53bdeb" : "currentColor"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={status === "leido" ? 1 : 0.7}
      />
      <path
        d="M6 5.5 10 9.5 20 1"
        stroke={status === "leido" ? "#53bdeb" : "currentColor"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={status === "leido" ? 1 : 0.7}
      />
    </svg>
  );
}

export function ConversacionesView({ cuentaId }: { cuentaId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [previews, setPrevious] = useState<Record<string, { contenido: string | null; created_at: string }>>({});
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionada, setSeleccionada] = useState<string | null>(null);

  async function cargarLista() {
    setCargando(true);
    const { data } = await supabase
      .from("conversaciones")
      .select("id, telefono, status, agente_ia_activo, contacto_id, created_at, contactos(nombre)")
      .order("created_at", { ascending: false });

    const lista: Conversacion[] = ((data as ConversacionCruda[]) ?? []).map((c) => ({
      id: c.id,
      telefono: c.telefono,
      status: c.status,
      agente_ia_activo: c.agente_ia_activo,
      contacto_id: c.contacto_id,
      created_at: c.created_at,
      nombreContacto: nombreDe(c),
    }));
    setConversaciones(lista);

    const { data: mensajesRecientes } = await supabase
      .from("mensajes")
      .select("conversacion_id, contenido, created_at")
      .not("conversacion_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(300);

    const mapa: Record<string, { contenido: string | null; created_at: string }> = {};
    for (const m of mensajesRecientes ?? []) {
      if (m.conversacion_id && !mapa[m.conversacion_id]) {
        mapa[m.conversacion_id] = { contenido: m.contenido, created_at: m.created_at };
      }
    }
    setPrevious(mapa);
    setCargando(false);
  }

  useEffect(() => {
    cargarLista();

    const canal = supabase
      .channel(`mensajes-cuenta-${cuentaId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensajes", filter: `cuenta_id=eq.${cuentaId}` },
        () => cargarLista(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuentaId]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return conversaciones;
    return conversaciones.filter(
      (c) => c.nombreContacto?.toLowerCase().includes(q) || c.telefono.includes(q),
    );
  }, [conversaciones, busqueda]);

  const conversacionActiva = conversaciones.find((c) => c.id === seleccionada) ?? null;

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-4">
      <div
        className={`${seleccionada ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] md:w-80`}
      >
        <div className="border-b border-[var(--color-borde)] p-4">
          <h1 className="text-base font-bold text-[var(--color-texto)]">Conversaciones</h1>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar…"
            className="mt-3 w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-1.5 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {cargando ? (
            <p className="p-4 text-sm text-[var(--color-texto-mute)]">Cargando…</p>
          ) : filtradas.length === 0 ? (
            <p className="p-4 text-sm text-[var(--color-texto-mute)]">Sin conversaciones.</p>
          ) : (
            filtradas.map((c) => {
              const preview = previews[c.id];
              return (
                <button
                  key={c.id}
                  onClick={() => setSeleccionada(c.id)}
                  className="block w-full border-b border-[var(--color-borde)] px-4 py-3 text-left transition-colors last:border-0"
                  style={seleccionada === c.id ? { background: "color-mix(in srgb, var(--color-marca) 12%, transparent)" } : undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-[var(--color-texto)]">
                      {c.nombreContacto ?? c.telefono}
                    </span>
                    <Badge tono={c.status === "abierta" ? "en-vivo" : "mute"}>
                      {c.status === "abierta" ? "Abierta" : "Cerrada"}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-[var(--color-texto-mute)]">
                    {preview?.contenido ?? "Sin mensajes"}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div
        className={`${seleccionada ? "flex" : "hidden md:flex"} flex-1 flex-col rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)]`}
      >
        {conversacionActiva ? (
          <PanelConversacion
            key={conversacionActiva.id}
            conversacion={conversacionActiva}
            cuentaId={cuentaId}
            onCambio={cargarLista}
            onVolver={() => setSeleccionada(null)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-texto-mute)]">
            Selecciona una conversación.
          </div>
        )}
      </div>
    </div>
  );
}

function PanelConversacion({
  conversacion,
  cuentaId,
  onCambio,
  onVolver,
}: {
  conversacion: Conversacion;
  cuentaId: string;
  onCambio: () => void;
  onVolver: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [procesandoSugerencia, setProcesandoSugerencia] = useState<string | null>(null);
  const [templatesAprobados, setTemplatesAprobados] = useState<{ id: string; name: string }[]>([]);
  const [templateSeleccionado, setTemplateSeleccionado] = useState("");
  const [previaPlantilla, setPreviaPlantilla] = useState<{ body: string; header_tipo: string; footer_texto: string | null } | null>(null);
  const [cargandoPrevia, setCargandoPrevia] = useState(false);
  const [enviandoPlantilla, setEnviandoPlantilla] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  async function cargarMensajes() {
    setCargando(true);
    const { data } = await supabase
      .from("mensajes")
      .select("id, direccion, tipo, contenido, media_url, template_nombre, status, created_at, sugerencia_ia, sugerencia_usada, feedback_ia")
      .eq("conversacion_id", conversacion.id)
      .order("created_at", { ascending: true });
    setMensajes(data ?? []);
    setCargando(false);
  }

  // Marca la conversación como vista -- así deja de contar en la
  // "esferita" de pendientes de la barra lateral. Se llama al abrirla y de
  // nuevo cada vez que llega un mensaje mientras ya la tienes abierta.
  function marcarComoVisto() {
    supabase.from("conversaciones").update({ ultimo_visto_en: new Date().toISOString() }).eq("id", conversacion.id).then();
  }

  useEffect(() => {
    cargarMensajes();
    marcarComoVisto();

    const canal = supabase
      .channel(`mensajes-conversacion-${conversacion.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensajes", filter: `conversacion_id=eq.${conversacion.id}` },
        (payload) => {
          const nuevo = payload.new as Mensaje;
          // El envío manual dispara un refetch completo (cargarMensajes) que
          // puede ganarle la carrera a este evento de Realtime -- sin este
          // chequeo, el mismo mensaje termina agregado dos veces.
          setMensajes((prev) => (prev.some((m) => m.id === nuevo.id) ? prev : [...prev, nuevo]));
          if (nuevo.direccion === "entrante") marcarComoVisto();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "mensajes", filter: `conversacion_id=eq.${conversacion.id}` },
        (payload) => {
          const actualizado = payload.new as Mensaje;
          setMensajes((prev) => prev.map((m) => (m.id === actualizado.id ? actualizado : m)));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacion.id]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes.length]);

  useEffect(() => {
    supabase
      .from("templates")
      .select("id, name")
      .eq("status", "approved")
      .then(({ data }) => setTemplatesAprobados(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!templateSeleccionado || !conversacion.contacto_id) {
      setPreviaPlantilla(null);
      return;
    }
    setCargandoPrevia(true);
    fetch("/api/plantillas/previsualizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: templateSeleccionado, contacto_id: conversacion.contacto_id }),
    })
      .then((res) => res.json())
      .then((data) => setPreviaPlantilla(data.error ? null : data))
      .finally(() => setCargandoPrevia(false));
  }, [templateSeleccionado, conversacion.contacto_id]);

  async function enviarPlantilla() {
    if (!templateSeleccionado) return;
    setEnviandoPlantilla(true);
    const res = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversacion_id: conversacion.id, tipo: "template", template_id: templateSeleccionado }),
    });
    setEnviandoPlantilla(false);
    if (res.ok) {
      setTemplateSeleccionado("");
      setPreviaPlantilla(null);
      cargarMensajes();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "No se pudo enviar la plantilla.");
    }
  }

  async function alternarAgente() {
    const activando = !conversacion.agente_ia_activo;
    await supabase
      .from("conversaciones")
      // Al reactivar, se reinicia el contador de "mensajes seguidos" del
      // agente -- si no, una conversación vieja transferida se transfiere
      // otra vez en el siguiente mensaje aunque se reactive a mano.
      .update(activando ? { agente_ia_activo: true, agente_activado_en: new Date().toISOString() } : { agente_ia_activo: false })
      .eq("id", conversacion.id);
    onCambio();
  }

  async function alternarStatus() {
    await supabase
      .from("conversaciones")
      .update({ status: conversacion.status === "abierta" ? "cerrada" : "abierta" })
      .eq("id", conversacion.id);
    onCambio();
  }

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    const res = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversacion_id: conversacion.id, texto: texto.trim() }),
    });
    setEnviando(false);
    if (res.ok) {
      setTexto("");
      cargarMensajes();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "No se pudo enviar el mensaje.");
    }
  }

  async function usarSugerencia(mensajeId: string, textoAEnviar: string) {
    setProcesandoSugerencia(mensajeId);
    const res = await fetch(`/api/mensajes/${mensajeId}/usar-sugerencia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: textoAEnviar }),
    });
    setProcesandoSugerencia(null);
    if (res.ok) {
      cargarMensajes();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "No se pudo enviar la sugerencia.");
    }
  }

  async function descartarSugerencia(mensajeId: string) {
    await supabase.from("mensajes").update({ sugerencia_usada: true }).eq("id", mensajeId);
    cargarMensajes();
  }

  async function calificarSugerencia(mensajeId: string, feedback: "positivo" | "negativo") {
    await supabase.from("mensajes").update({ feedback_ia: feedback }).eq("id", mensajeId);
    cargarMensajes();
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-borde)] p-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={onVolver}
            aria-label="Volver a la lista"
            className="shrink-0 rounded-lg p-1 text-[var(--color-texto-mute)] hover:text-[var(--color-texto)] md:hidden"
          >
            ←
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--color-texto)]">
              {conversacion.nombreContacto ?? conversacion.telefono}
            </p>
            <p className="truncate text-xs text-[var(--color-texto-mute)]">{conversacion.telefono}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={alternarAgente}
            className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-1.5 text-xs font-medium text-[var(--color-texto)] hover:opacity-80"
          >
            Agente IA: {conversacion.agente_ia_activo ? "activo" : "pausado"}
          </button>
          <button
            onClick={alternarStatus}
            className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-1.5 text-xs font-medium text-[var(--color-texto)] hover:opacity-80"
          >
            {conversacion.status === "abierta" ? "Cerrar" : "Reabrir"}
          </button>
        </div>
      </div>

      <EtiquetaYEtapaContacto cuentaId={cuentaId} contactoId={conversacion.contacto_id} />

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {cargando ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : mensajes.length === 0 ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Todavía no hay mensajes.</p>
        ) : (
          mensajes.map((m) => (
            <div key={m.id}>
              <div className={`flex ${m.direccion === "saliente" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[85%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[70%]"
                  style={
                    m.direccion === "saliente"
                      ? { background: "var(--color-marca)", color: "var(--color-accion-fg)" }
                      : { background: "var(--color-bg-elevada)", color: "var(--color-texto)" }
                  }
                >
                  {m.tipo === "imagen" && m.media_url && (
                    <img src={m.media_url} alt="Imagen enviada" className="mb-1.5 max-w-[240px] rounded-lg" />
                  )}
                  {m.tipo === "audio" && m.media_url && (
                    <audio controls src={m.media_url} className="mb-1.5 max-w-full" style={{ height: 32 }} />
                  )}
                  {m.tipo === "audio" && m.contenido && (
                    <p className="text-xs italic opacity-80">&ldquo;{m.contenido}&rdquo;</p>
                  )}
                  {m.tipo !== "audio" && (
                    <p>{m.contenido ?? (m.template_nombre ? `Plantilla: ${m.template_nombre}` : m.tipo === "imagen" ? "" : "—")}</p>
                  )}
                  <p className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
                    {new Date(m.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                    {m.direccion === "saliente" && <IconoEstadoMensaje status={m.status} />}
                  </p>
                </div>
              </div>

              {m.sugerencia_ia && (
                <SugerenciaIA
                  mensaje={m}
                  procesando={procesandoSugerencia === m.id}
                  onUsar={(texto) => usarSugerencia(m.id, texto)}
                  onDescartar={() => descartarSugerencia(m.id)}
                  onCalificar={(feedback) => calificarSugerencia(m.id, feedback)}
                />
              )}
            </div>
          ))
        )}
        <div ref={finRef} />
      </div>

      <div className="flex gap-2 border-t border-[var(--color-borde)] p-4">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") enviar();
          }}
          placeholder="Escribe un mensaje…"
          className="flex-1 rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
        <button
          onClick={enviar}
          disabled={enviando}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          Enviar
        </button>
      </div>

      {templatesAprobados.length > 0 && (
        <div className="space-y-2 border-t border-[var(--color-borde)] p-4">
          <div className="flex gap-2">
            <select
              value={templateSeleccionado}
              onChange={(e) => setTemplateSeleccionado(e.target.value)}
              className="flex-1 rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
            >
              <option value="">Enviar una plantilla…</option>
              {templatesAprobados.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={enviarPlantilla}
              disabled={!templateSeleccionado || enviandoPlantilla || cargandoPrevia}
              className="shrink-0 rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-4 py-2 text-sm font-semibold text-[var(--color-texto)] transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {enviandoPlantilla ? "Enviando…" : "Enviar plantilla"}
            </button>
          </div>
          {cargandoPrevia && <p className="text-xs text-[var(--color-texto-mute)]">Cargando vista previa…</p>}
          {previaPlantilla && (
            <div className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] p-3 text-sm text-[var(--color-texto)]">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-texto-mute)]">Vista previa</p>
              <p className="whitespace-pre-wrap">{previaPlantilla.body}</p>
              {previaPlantilla.footer_texto && <p className="mt-1 text-xs text-[var(--color-texto-mute)]">{previaPlantilla.footer_texto}</p>}
            </div>
          )}
        </div>
      )}
    </>
  );
}

type EtiquetaCatalogo = { id: string; nombre: string; color: string };
type EtapaLite = { id: string; nombre: string; color: string };
type DealLite = { id: string; etapa_id: string | null; estado: string };

function ChipMini({ nombre, color }: { nombre: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {nombre}
    </span>
  );
}

// Fila de contexto del contacto justo debajo del nombre/teléfono -- antes no
// había forma de ver ni cambiar su etiqueta o en qué etapa del pipeline está
// sin salirte de Conversaciones. El "deal" relevante es el más reciente
// abierto (o el más reciente a secas si no tiene ninguno abierto), ya que un
// contacto puede tener varios a lo largo del tiempo.
function EtiquetaYEtapaContacto({ cuentaId, contactoId }: { cuentaId: string; contactoId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [etiquetasContacto, setEtiquetasContacto] = useState<string[]>([]);
  const [catalogoEtiquetas, setCatalogoEtiquetas] = useState<EtiquetaCatalogo[]>([]);
  const [etapas, setEtapas] = useState<EtapaLite[]>([]);
  const [deal, setDeal] = useState<DealLite | null>(null);
  const [cargando, setCargando] = useState(true);
  const [editandoEtiquetas, setEditandoEtiquetas] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  async function cargar() {
    const [{ data: contacto }, { data: etq }, { data: et }, { data: dealsDelContacto }] = await Promise.all([
      supabase.from("contactos").select("etiquetas").eq("id", contactoId).maybeSingle(),
      supabase.from("etiquetas").select("id, nombre, color").eq("cuenta_id", cuentaId).order("nombre"),
      supabase.from("etapas_pipeline").select("id, nombre, color").eq("cuenta_id", cuentaId).order("orden"),
      supabase.from("deals").select("id, etapa_id, estado, created_at").eq("contacto_id", contactoId).order("created_at", { ascending: false }),
    ]);
    setEtiquetasContacto(contacto?.etiquetas ?? []);
    setCatalogoEtiquetas(etq ?? []);
    setEtapas(et ?? []);
    const lista = dealsDelContacto ?? [];
    setDeal(lista.find((d) => d.estado === "abierto") ?? lista[0] ?? null);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactoId, cuentaId]);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setEditandoEtiquetas(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  async function alternarEtiqueta(nombre: string) {
    const nuevas = etiquetasContacto.includes(nombre) ? etiquetasContacto.filter((e) => e !== nombre) : [...etiquetasContacto, nombre];
    setEtiquetasContacto(nuevas);
    await supabase.from("contactos").update({ etiquetas: nuevas }).eq("id", contactoId);
  }

  async function cambiarEtapa(etapaId: string) {
    if (!deal) return;
    setDeal({ ...deal, etapa_id: etapaId || null });
    await fetch(`/api/deals/${deal.id}/mover-etapa`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etapa_id: etapaId || null }),
    });
  }

  if (cargando) return null;

  const etapaActual = deal?.etapa_id ? etapas.find((e) => e.id === deal.etapa_id) : null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-4 py-1.5">
      <div className="relative" ref={popoverRef}>
        <button type="button" onClick={() => setEditandoEtiquetas((v) => !v)} className="flex flex-wrap items-center gap-1">
          {etiquetasContacto.length === 0 ? (
            <span className="text-xs text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">+ Etiqueta</span>
          ) : (
            etiquetasContacto.map((nombre) => {
              const cat = catalogoEtiquetas.find((c) => c.nombre === nombre);
              return <ChipMini key={nombre} nombre={nombre} color={cat?.color ?? "#8b5cf6"} />;
            })
          )}
        </button>
        {editandoEtiquetas && (
          <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-2 shadow-lg">
            {catalogoEtiquetas.length === 0 ? (
              <p className="px-1 py-1 text-xs text-[var(--color-texto-mute)]">Todavía no hay etiquetas creadas.</p>
            ) : (
              catalogoEtiquetas.map((et) => (
                <label key={et.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-[var(--color-bg-elevada)]">
                  <input type="checkbox" checked={etiquetasContacto.includes(et.nombre)} onChange={() => alternarEtiqueta(et.nombre)} />
                  <ChipMini nombre={et.nombre} color={et.color} />
                </label>
              ))
            )}
          </div>
        )}
      </div>

      <span className="text-[var(--color-texto-mute)]">·</span>

      {deal ? (
        <select
          value={deal.etapa_id ?? ""}
          onChange={(e) => cambiarEtapa(e.target.value)}
          className="rounded-md border-none bg-transparent text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          style={{ color: etapaActual?.color ?? "var(--color-texto-mute)" }}
        >
          <option value="">Sin etapa</option>
          {etapas.map((et) => (
            <option key={et.id} value={et.id}>
              {et.nombre}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-xs text-[var(--color-texto-mute)]">Sin deal en el pipeline</span>
      )}
    </div>
  );
}

function SugerenciaIA({
  mensaje,
  procesando,
  onUsar,
  onDescartar,
  onCalificar,
}: {
  mensaje: Mensaje;
  procesando: boolean;
  onUsar: (texto: string) => void;
  onDescartar: () => void;
  onCalificar: (feedback: "positivo" | "negativo") => void;
}) {
  const [borrador, setBorrador] = useState(mensaje.sugerencia_ia ?? "");

  return (
    <div className="mt-1.5 flex justify-start">
      <div
        className="max-w-[80%] rounded-2xl border p-3"
        style={{ borderColor: "var(--color-ia)", background: "color-mix(in srgb, var(--color-ia) 10%, transparent)" }}
      >
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ia)" }}>
          Sugerencia IA
        </p>

        {mensaje.sugerencia_usada ? (
          <p className="text-sm text-[var(--color-texto-mute)]">{borrador}</p>
        ) : (
          <textarea
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-2.5 py-1.5 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        )}

        <div className="mt-2 flex flex-wrap items-center gap-3">
          {!mensaje.sugerencia_usada && (
            <>
              <button
                onClick={() => onUsar(borrador)}
                disabled={procesando}
                className="text-xs font-semibold hover:underline disabled:opacity-50"
                style={{ color: "var(--color-marca)" }}
              >
                {procesando ? "Enviando…" : "Usar sugerencia"}
              </button>
              <button onClick={onDescartar} disabled={procesando} className="text-xs font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
                Descartar
              </button>
            </>
          )}
          <button
            onClick={() => onCalificar("positivo")}
            title="Me gustó"
            className="text-sm"
            style={{ opacity: mensaje.feedback_ia === "positivo" ? 1 : 0.4 }}
          >
            👍
          </button>
          <button
            onClick={() => onCalificar("negativo")}
            title="No me gustó"
            className="text-sm"
            style={{ opacity: mensaje.feedback_ia === "negativo" ? 1 : 0.4 }}
          >
            👎
          </button>
        </div>
      </div>
    </div>
  );
}
