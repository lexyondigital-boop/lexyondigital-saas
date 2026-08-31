"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/Badge";
import { CampoTelefono } from "@/components/CampoTelefono";
import type { CampoPersonalizado } from "@/lib/campos-personalizados";

type Contacto = {
  id: string;
  telefono: string;
  nombre: string | null;
  nombre_completo: string | null;
  correo_electronico: string | null;
  etiquetas: string[];
  status: "activo" | "inactivo";
  canal_origen: string | null;
  created_at: string;
};

type ColumnaConfig = { id: string; visible: boolean };

type EtapaLite = { id: string; nombre: string; color: string; orden: number };
type DealLite = { id: string; contacto_id: string; etapa_id: string | null; estado: string; created_at: string };
type EtapaDeContacto = { etapa_id: string | null; nombre: string; color: string } | null;

const COLUMNAS_BASE: { id: string; etiqueta: string }[] = [
  { id: "nombre", etiqueta: "Nombre" },
  { id: "nombre_completo", etiqueta: "Nombre completo" },
  { id: "telefono", etiqueta: "Teléfono" },
  { id: "correo_electronico", etiqueta: "Correo electrónico" },
  { id: "etiquetas", etiqueta: "Etiquetas" },
  { id: "etapa_pipeline", etiqueta: "Etapa / Pipeline" },
  { id: "canal_origen", etiqueta: "Canal" },
  { id: "status", etiqueta: "Estado" },
];

function claveColumnas(cuentaId: string) {
  return `lexyon-columnas-contactos-${cuentaId}`;
}

function fusionarConfigColumnas(guardada: ColumnaConfig[], disponibles: { id: string }[]): ColumnaConfig[] {
  const idsDisponibles = new Set(disponibles.map((d) => d.id));
  const resultado = guardada.filter((g) => idsDisponibles.has(g.id));
  const yaIncluidos = new Set(resultado.map((r) => r.id));
  for (const d of disponibles) {
    if (!yaIncluidos.has(d.id)) {
      resultado.push({ id: d.id, visible: !d.id.startsWith("campo:") });
    }
  }
  return resultado;
}

function valorPersonalizadoMostrable(campo: CampoPersonalizado, valor: string | undefined) {
  if (!valor) return "—";
  if (campo.tipo === "checkbox") return valor.split(",").filter(Boolean).join(", ") || "—";
  if (campo.tipo === "date") {
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime())
      ? valor
      : fecha.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  }
  return valor;
}

export function ContactosView({ cuentaId }: { cuentaId: string }) {
  const supabase = createClient();
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [etiquetasCatalogo, setEtiquetasCatalogo] = useState<string[]>([]);
  const [camposPersonalizados, setCamposPersonalizados] = useState<CampoPersonalizado[]>([]);
  const [valoresPorContacto, setValoresPorContacto] = useState<Record<string, Record<string, string>>>({});
  const [etapas, setEtapas] = useState<EtapaLite[]>([]);
  const [dealsPorContacto, setDealsPorContacto] = useState<Record<string, DealLite>>({});
  const [configColumnas, setConfigColumnas] = useState<ColumnaConfig[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEtapa, setFiltroEtapa] = useState("");
  const [editando, setEditando] = useState<Contacto | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarColumnas, setMostrarColumnas] = useState(false);

  async function cargar() {
    setCargando(true);
    const [{ data: c }, { data: e }, { data: cp }, { data: vp }, { data: et }, { data: d }] = await Promise.all([
      supabase.from("contactos").select("*").order("created_at", { ascending: false }),
      supabase.from("etiquetas").select("nombre").order("nombre"),
      supabase.from("campos_personalizados").select("*").order("orden"),
      supabase.from("valores_campos_personalizados").select("contacto_id, campo_id, valor"),
      supabase.from("etapas_pipeline").select("id, nombre, color, orden").order("orden"),
      supabase.from("deals").select("id, contacto_id, etapa_id, estado, created_at").order("created_at", { ascending: false }),
    ]);
    setContactos(c ?? []);
    setEtiquetasCatalogo((e ?? []).map((x) => x.nombre));
    setCamposPersonalizados((cp as CampoPersonalizado[]) ?? []);
    setEtapas((et as EtapaLite[]) ?? []);

    const mapa: Record<string, Record<string, string>> = {};
    for (const v of vp ?? []) {
      if (!mapa[v.contacto_id]) mapa[v.contacto_id] = {};
      mapa[v.contacto_id][v.campo_id] = v.valor ?? "";
    }
    setValoresPorContacto(mapa);

    // El deal "relevante" de un contacto es el abierto más reciente -- si no
    // tiene ninguno abierto, el más reciente a secas. (d) ya viene ordenado
    // desc por created_at, así que el primero que se encuentre por contacto
    // gana salvo que uno abierto aparezca después.
    const dealsMap: Record<string, DealLite> = {};
    for (const deal of (d as DealLite[]) ?? []) {
      const actual = dealsMap[deal.contacto_id];
      if (!actual || (actual.estado !== "abierto" && deal.estado === "abierto")) {
        dealsMap[deal.contacto_id] = deal;
      }
    }
    setDealsPorContacto(dealsMap);

    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Las variables fijas del sistema (nombre_completo, telefono,
  // correo_electronico) ya están cubiertas por COLUMNAS_BASE -- se excluyen
  // acá para no ofrecerlas dos veces en el selector de columnas.
  const columnasDisponibles = useMemo(
    () => [
      ...COLUMNAS_BASE,
      ...camposPersonalizados.filter((c) => !c.es_fijo).map((c) => ({ id: `campo:${c.id}`, etiqueta: c.nombre })),
    ],
    [camposPersonalizados],
  );

  useEffect(() => {
    let guardada: ColumnaConfig[] = [];
    try {
      const raw = localStorage.getItem(claveColumnas(cuentaId));
      if (raw) guardada = JSON.parse(raw);
    } catch {
      guardada = [];
    }
    setConfigColumnas(fusionarConfigColumnas(guardada, columnasDisponibles));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnasDisponibles]);

  useEffect(() => {
    if (configColumnas.length === 0) return;
    localStorage.setItem(claveColumnas(cuentaId), JSON.stringify(configColumnas));
  }, [configColumnas, cuentaId]);

  function alternarVisible(id: string) {
    setConfigColumnas((prev) => prev.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)));
  }

  function moverColumna(id: string, direccion: -1 | 1) {
    setConfigColumnas((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      const destino = idx + direccion;
      if (destino < 0 || destino >= prev.length) return prev;
      const copia = [...prev];
      [copia[idx], copia[destino]] = [copia[destino], copia[idx]];
      return copia;
    });
  }

  const etiquetaColumna = (id: string) => columnasDisponibles.find((c) => c.id === id)?.etiqueta ?? id;
  const columnasVisibles = configColumnas.filter((c) => c.visible);

  const etapasPorId = useMemo(() => new Map(etapas.map((e) => [e.id, e])), [etapas]);

  function etapaDeContacto(contactoId: string): EtapaDeContacto {
    const deal = dealsPorContacto[contactoId];
    if (!deal) return null;
    if (!deal.etapa_id) return { etapa_id: null, nombre: "Sin etapa", color: "#64748b" };
    const etapa = etapasPorId.get(deal.etapa_id);
    return etapa ? { etapa_id: etapa.id, nombre: etapa.nombre, color: etapa.color } : null;
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return contactos.filter((c) => {
      if (q && !(c.nombre?.toLowerCase().includes(q) || c.telefono.includes(q) || c.etiquetas.some((et) => et.toLowerCase().includes(q)))) {
        return false;
      }
      if (filtroEtapa) {
        const deal = dealsPorContacto[c.id];
        if (filtroEtapa === "__sin_deal__" && deal) return false;
        if (filtroEtapa !== "__sin_deal__" && (!deal || deal.etapa_id !== filtroEtapa)) return false;
      }
      return true;
    });
  }, [contactos, busqueda, filtroEtapa, dealsPorContacto]);

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este contacto? También se borran sus conversaciones y mensajes.")) return;
    await supabase.from("contactos").delete().eq("id", id);
    cargar();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-texto)]">Contactos</h1>
          <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
            {contactos.length} contacto{contactos.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, teléfono o etiqueta"
            className="w-72 rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
          {etapas.length > 0 && (
            <select
              value={filtroEtapa}
              onChange={(e) => setFiltroEtapa(e.target.value)}
              className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
            >
              <option value="">Todas las etapas</option>
              {etapas.map((et) => (
                <option key={et.id} value={et.id}>
                  {et.nombre}
                </option>
              ))}
              <option value="__sin_deal__">Sin deal en pipeline</option>
            </select>
          )}
          <button
            onClick={() => setMostrarColumnas((v) => !v)}
            className="shrink-0 rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-4 py-2 text-sm font-medium text-[var(--color-texto)] transition-opacity hover:opacity-80"
          >
            Columnas
          </button>
          <button
            onClick={() => {
              setEditando(null);
              setMostrarForm((v) => !v);
            }}
            style={{ boxShadow: "var(--halo-accion)" }}
            className="shrink-0 rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
          >
            {mostrarForm && !editando ? "Cancelar" : "Nuevo contacto"}
          </button>
        </div>
      </div>

      {mostrarColumnas && (
        <div className="mb-6 max-w-md rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
          <h2 className="mb-1 text-sm font-semibold text-[var(--color-texto)]">Columnas de la tabla</h2>
          <p className="mb-3 text-xs text-[var(--color-texto-mute)]">
            Marca cuáles mostrar y usa las flechas para acomodar el orden. Los cambios se guardan solos.
          </p>
          <div className="space-y-1.5">
            {configColumnas.map((col, idx) => (
              <div key={col.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-[var(--color-bg-elevada)]">
                <label className="flex items-center gap-2 text-sm text-[var(--color-texto)]">
                  <input type="checkbox" checked={col.visible} onChange={() => alternarVisible(col.id)} />
                  {etiquetaColumna(col.id)}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => moverColumna(col.id, -1)}
                    disabled={idx === 0}
                    className="text-[var(--color-texto-mute)] hover:text-[var(--color-texto)] disabled:opacity-30"
                    title="Mover antes"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moverColumna(col.id, 1)}
                    disabled={idx === configColumnas.length - 1}
                    className="text-[var(--color-texto-mute)] hover:text-[var(--color-texto)] disabled:opacity-30"
                    title="Mover después"
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end border-t border-[var(--color-borde)] pt-3">
            <button
              onClick={() => setMostrarColumnas(false)}
              style={{ boxShadow: "var(--halo-accion)" }}
              className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
            >
              Listo
            </button>
          </div>
        </div>
      )}

      {(mostrarForm || editando) && (
        <ContactoForm
          cuentaId={cuentaId}
          etiquetasCatalogo={etiquetasCatalogo}
          camposPersonalizados={camposPersonalizados}
          contacto={editando}
          onGuardado={() => {
            setMostrarForm(false);
            setEditando(null);
            cargar();
          }}
          onCancelar={() => {
            setMostrarForm(false);
            setEditando(null);
          }}
        />
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)]">
        {cargando ? (
          <p className="p-6 text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-texto-mute)]">Sin resultados.</p>
        ) : (
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-borde)] text-xs uppercase tracking-wide text-[var(--color-texto-mute)]">
                {columnasVisibles.map((col) => (
                  <th key={col.id} className="px-5 py-3 font-medium">
                    {etiquetaColumna(col.id)}
                  </th>
                ))}
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id} className="border-b border-[var(--color-borde)] last:border-0">
                  {columnasVisibles.map((col) => (
                    <td key={col.id} className="px-5 py-3.5 text-[var(--color-texto)]">
                      <CeldaContacto
                        columnaId={col.id}
                        contacto={c}
                        camposPersonalizados={camposPersonalizados}
                        valoresPersonalizados={valoresPorContacto[c.id] ?? {}}
                        etapa={etapaDeContacto(c.id)}
                      />
                    </td>
                  ))}
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => {
                        setMostrarForm(false);
                        setEditando(c);
                      }}
                      className="mr-3 text-sm font-medium text-[var(--color-marca)] hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => eliminar(c.id)}
                      className="text-sm font-medium text-red-500 hover:underline"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CeldaContacto({
  columnaId,
  contacto,
  camposPersonalizados,
  valoresPersonalizados,
  etapa,
}: {
  columnaId: string;
  contacto: Contacto;
  camposPersonalizados: CampoPersonalizado[];
  valoresPersonalizados: Record<string, string>;
  etapa: EtapaDeContacto;
}) {
  if (columnaId.startsWith("campo:")) {
    const campoId = columnaId.slice("campo:".length);
    const campo = camposPersonalizados.find((c) => c.id === campoId);
    if (!campo) return <span className="text-[var(--color-texto-mute)]">—</span>;
    return <span>{valorPersonalizadoMostrable(campo, valoresPersonalizados[campoId])}</span>;
  }

  switch (columnaId) {
    case "nombre":
      return <span>{contacto.nombre ?? "—"}</span>;
    case "nombre_completo":
      return <span>{contacto.nombre_completo ?? "—"}</span>;
    case "telefono":
      return <span>{contacto.telefono}</span>;
    case "correo_electronico":
      return <span>{contacto.correo_electronico ?? "—"}</span>;
    case "etiquetas":
      return (
        <div className="flex flex-wrap gap-1">
          {contacto.etiquetas.length === 0 ? (
            <span className="text-[var(--color-texto-mute)]">—</span>
          ) : (
            contacto.etiquetas.map((et) => (
              <Badge key={et} tono="ia">
                {et}
              </Badge>
            ))
          )}
        </div>
      );
    case "etapa_pipeline":
      if (!etapa) return <span className="text-[var(--color-texto-mute)]">—</span>;
      return (
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ color: etapa.color, background: `color-mix(in srgb, ${etapa.color} 14%, transparent)` }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: etapa.color }} />
          {etapa.nombre}
        </span>
      );
    case "canal_origen":
      return <span className="text-[var(--color-texto-mute)]">{contacto.canal_origen ?? "—"}</span>;
    case "status":
      return (
        <Badge tono={contacto.status === "activo" ? "en-vivo" : "mute"}>
          {contacto.status === "activo" ? "Activo" : "Inactivo"}
        </Badge>
      );
    default:
      return <span className="text-[var(--color-texto-mute)]">—</span>;
  }
}

function ContactoForm({
  cuentaId,
  etiquetasCatalogo,
  camposPersonalizados,
  contacto,
  onGuardado,
  onCancelar,
}: {
  cuentaId: string;
  etiquetasCatalogo: string[];
  camposPersonalizados: CampoPersonalizado[];
  contacto: Contacto | null;
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const supabase = createClient();
  const [nombre, setNombre] = useState(contacto?.nombre ?? "");
  const [nombreCompleto, setNombreCompleto] = useState(contacto?.nombre_completo ?? "");
  const [correoElectronico, setCorreoElectronico] = useState(contacto?.correo_electronico ?? "");
  const [telefono, setTelefono] = useState(contacto?.telefono ?? "");
  const [canalOrigen, setCanalOrigen] = useState(contacto?.canal_origen ?? "");
  const [status, setStatus] = useState<"activo" | "inactivo">(contacto?.status ?? "activo");
  const [etiquetas, setEtiquetas] = useState<string[]>(contacto?.etiquetas ?? []);
  const [valoresPersonalizados, setValoresPersonalizados] = useState<Record<string, string>>({});
  const [cargandoValores, setCargandoValores] = useState(!!contacto);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contacto) {
      setCargandoValores(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("valores_campos_personalizados")
        .select("campo_id, valor")
        .eq("contacto_id", contacto.id);
      const mapa: Record<string, string> = {};
      for (const v of data ?? []) mapa[v.campo_id] = v.valor ?? "";
      setValoresPersonalizados(mapa);
      setCargandoValores(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacto?.id]);

  function alternarEtiqueta(nombre: string) {
    setEtiquetas((prev) => (prev.includes(nombre) ? prev.filter((e) => e !== nombre) : [...prev, nombre]));
  }

  function alternarCasilla(campoId: string, opcion: string) {
    setValoresPersonalizados((prev) => {
      const actuales = (prev[campoId] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
      const nuevas = actuales.includes(opcion) ? actuales.filter((v) => v !== opcion) : [...actuales, opcion];
      return { ...prev, [campoId]: nuevas.join(",") };
    });
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);

    for (const campo of camposPersonalizados) {
      if (campo.requerido && !(valoresPersonalizados[campo.id] ?? "").trim()) {
        setError(`"${campo.nombre}" es obligatorio.`);
        return;
      }
    }

    setEnviando(true);

    const payload = {
      nombre: nombre.trim() || null,
      nombre_completo: nombreCompleto.trim() || null,
      correo_electronico: correoElectronico.trim() || null,
      telefono: telefono.trim(),
      canal_origen: canalOrigen.trim() || null,
      status,
      etiquetas,
    };

    const { data: guardado, error } = contacto
      ? await supabase.from("contactos").update(payload).eq("id", contacto.id).select("id").single()
      : await supabase.from("contactos").insert({ ...payload, cuenta_id: cuentaId }).select("id").single();

    if (error || !guardado) {
      setEnviando(false);
      setError(error?.message.includes("duplicate") ? "Ya existe un contacto con ese teléfono." : error?.message ?? "No se pudo guardar");
      return;
    }

    const filasValores = camposPersonalizados
      .filter((campo) => (valoresPersonalizados[campo.id] ?? "").trim())
      .map((campo) => ({
        contacto_id: guardado.id,
        campo_id: campo.id,
        valor: valoresPersonalizados[campo.id].trim(),
      }));

    if (filasValores.length > 0) {
      const { error: valoresError } = await supabase
        .from("valores_campos_personalizados")
        .upsert(filasValores, { onConflict: "contacto_id,campo_id" });

      if (valoresError) {
        setEnviando(false);
        setError(valoresError.message);
        return;
      }
    }

    setEnviando(false);
    onGuardado();
  }

  return (
    <form
      onSubmit={guardar}
      className="mb-2 space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6"
    >
      <h2 className="text-base font-semibold text-[var(--color-texto)]">
        {contacto ? "Editar contacto" : "Nuevo contacto"}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nombre (WhatsApp)</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nombre completo</span>
          <input
            value={nombreCompleto}
            onChange={(e) => setNombreCompleto(e.target.value)}
            placeholder="Como lo captura el equipo"
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <CampoTelefono required value={telefono} onChange={setTelefono} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Correo electrónico</span>
          <input
            type="email"
            value={correoElectronico}
            onChange={(e) => setCorreoElectronico(e.target.value)}
            placeholder="opcional"
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Canal de origen</span>
          <input
            value={canalOrigen}
            onChange={(e) => setCanalOrigen(e.target.value)}
            placeholder="Ej. WhatsApp, Facebook, manual"
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Estado</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "activo" | "inactivo")}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          >
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </label>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Etiquetas</span>
        {etiquetasCatalogo.length === 0 ? (
          <p className="text-xs text-[var(--color-texto-mute)]">
            Todavía no hay etiquetas creadas — créalas primero en la sección Etiquetas.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {etiquetasCatalogo.map((et) => {
              const activa = etiquetas.includes(et);
              return (
                <button
                  type="button"
                  key={et}
                  onClick={() => alternarEtiqueta(et)}
                  className="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                  style={
                    activa
                      ? { borderColor: "var(--color-marca)", background: "color-mix(in srgb, var(--color-marca) 14%, transparent)", color: "var(--color-marca)" }
                      : { borderColor: "var(--color-borde)", color: "var(--color-texto-mute)" }
                  }
                >
                  {et}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {cargandoValores ? (
        <p className="text-sm text-[var(--color-texto-mute)]">Cargando campos personalizados…</p>
      ) : (
        camposPersonalizados.some((c) => !c.es_fijo) && (
          <div className="space-y-4 border-t border-[var(--color-borde)] pt-4">
            {camposPersonalizados.filter((c) => !c.es_fijo).map((campo) => (
              <CampoPersonalizadoInput
                key={campo.id}
                campo={campo}
                valor={valoresPersonalizados[campo.id] ?? ""}
                onCambio={(valor) => setValoresPersonalizados((prev) => ({ ...prev, [campo.id]: valor }))}
                onAlternarCasilla={(opcion) => alternarCasilla(campo.id, opcion)}
              />
            ))}
          </div>
        )
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={enviando}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {enviando ? "Guardando…" : contacto ? "Guardar cambios" : "Crear contacto"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function CampoPersonalizadoInput({
  campo,
  valor,
  onCambio,
  onAlternarCasilla,
}: {
  campo: CampoPersonalizado;
  valor: string;
  onCambio: (valor: string) => void;
  onAlternarCasilla: (opcion: string) => void;
}) {
  const etiqueta = (
    <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">
      {campo.nombre} {campo.requerido && <span className="text-red-500">*</span>}
    </span>
  );

  const inputClase =
    "w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]";

  if (campo.tipo === "select") {
    return (
      <label className="block">
        {etiqueta}
        <select value={valor} onChange={(e) => onCambio(e.target.value)} className={inputClase}>
          <option value="">Selecciona…</option>
          {campo.opciones.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (campo.tipo === "checkbox") {
    const seleccionadas = valor.split(",").map((v) => v.trim()).filter(Boolean);
    return (
      <div>
        {etiqueta}
        <div className="flex flex-wrap gap-3">
          {campo.opciones.map((op) => (
            <label key={op} className="flex items-center gap-1.5 text-sm text-[var(--color-texto)]">
              <input type="checkbox" checked={seleccionadas.includes(op)} onChange={() => onAlternarCasilla(op)} />
              {op}
            </label>
          ))}
        </div>
      </div>
    );
  }

  const tipoInput = campo.tipo === "number" ? "number" : campo.tipo === "date" ? "date" : campo.tipo === "email" ? "email" : "text";

  return (
    <label className="block">
      {etiqueta}
      <input type={tipoInput} value={valor} onChange={(e) => onCambio(e.target.value)} className={inputClase} />
    </label>
  );
}
