"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/Badge";
import { AsistentePlantillaModal } from "@/components/AsistentePlantillaModal";
import type { Template } from "@/components/PlantillasView";

const INPUT =
  "w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]";

type Campana = {
  id: string;
  nombre: string;
  status: "borrador" | "enviando" | "pausada" | "enviada";
  total_destinatarios: number;
  programado_para: string | null;
  templates: { name: string } | null;
  etiquetas: { nombre: string } | null;
};

type EstadisticasCampana = { enviado: number; entregado: number; leido: number; fallido: number };
type PerfilLite = { id: string; nombre: string | null };
type ContactoImportado = { id: string; telefono: string; nombre_completo: string | null; correo_electronico: string | null; etiquetas: string[]; canal_origen: string | null };

const TONO_STATUS = { borrador: "mute", enviando: "en-vivo", pausada: "aviso", enviada: "marca" } as const;
const LABEL_STATUS = { borrador: "Borrador", enviando: "Enviando", pausada: "Pausada", enviada: "Enviada" } as const;
const LABEL_CATEGORIA = { MARKETING: "Marketing", UTILITY: "Utilidad", AUTHENTICATION: "Autenticación" } as const;

export function CampanasView({ cuentaId }: { cuentaId: string }) {
  const supabase = createClient();
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [estadisticas, setEstadisticas] = useState<Record<string, EstadisticasCampana>>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [etiquetas, setEtiquetas] = useState<{ id: string; nombre: string }[]>([]);
  const [perfiles, setPerfiles] = useState<PerfilLite[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cargandoContactosDe, setCargandoContactosDe] = useState<Campana | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    const [{ data: c }, { data: t }, { data: e }, { data: p }] = await Promise.all([
      supabase
        .from("campanas")
        .select("id, nombre, status, total_destinatarios, programado_para, templates(name), etiquetas(nombre)")
        .order("created_at", { ascending: false }),
      supabase.from("templates").select("*"),
      supabase.from("etiquetas").select("id, nombre").order("nombre"),
      supabase.from("perfiles").select("id, nombre").eq("activo", true).order("nombre"),
    ]);
    const listaCampanas = (c as unknown as Campana[]) ?? [];
    setCampanas(listaCampanas);
    setTemplates((t as Template[]) ?? []);
    setEtiquetas(e ?? []);
    setPerfiles((p as PerfilLite[]) ?? []);

    if (listaCampanas.length > 0) {
      const { data: mensajesCampana } = await supabase
        .from("mensajes")
        .select("campana_id, status")
        .in("campana_id", listaCampanas.map((camp) => camp.id));

      const tally: Record<string, EstadisticasCampana> = {};
      for (const m of mensajesCampana ?? []) {
        if (!m.campana_id) continue;
        if (!tally[m.campana_id]) tally[m.campana_id] = { enviado: 0, entregado: 0, leido: 0, fallido: 0 };
        // "entregado"/"leido" ya implican que se envió -- se cuentan también
        // como enviado para que la primera cifra nunca quede por debajo de
        // las que le siguen.
        if (m.status === "enviado" || m.status === "entregado" || m.status === "leido") tally[m.campana_id].enviado++;
        if (m.status === "entregado" || m.status === "leido") tally[m.campana_id].entregado++;
        if (m.status === "leido") tally[m.campana_id].leido++;
        if (m.status === "fallido") tally[m.campana_id].fallido++;
      }
      setEstadisticas(tally);
    }

    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const templatesAprobados = useMemo(() => templates.filter((t) => t.status === "approved"), [templates]);

  async function pausar(id: string) {
    await supabase.from("campanas").update({ status: "pausada" }).eq("id", id);
    cargar();
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta campaña?")) return;
    await supabase.from("campanas").delete().eq("id", id);
    cargar();
  }

  async function enviarAhora(id: string) {
    setError(null);
    const res = await fetch(`/api/campanas/${id}/iniciar`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo iniciar la campaña");
      return;
    }
    cargar();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-texto)]">Campañas</h1>
          <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
            {campanas.length} campaña{campanas.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          onClick={() => setMostrarForm((v) => !v)}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
        >
          {mostrarForm ? "Cancelar" : "Nueva campaña"}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      {mostrarForm && (
        <CampanaForm
          cuentaId={cuentaId}
          templatesAprobados={templatesAprobados}
          etiquetas={etiquetas}
          onCreada={() => {
            setMostrarForm(false);
            cargar();
          }}
          onTemplatesCambiados={cargar}
        />
      )}

      {cargandoContactosDe && (
        <CargarContactosModal
          campana={cargandoContactosDe}
          perfiles={perfiles}
          onListo={() => {
            setCargandoContactosDe(null);
            cargar();
          }}
          onCancelar={() => setCargandoContactosDe(null)}
        />
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)]">
        {cargando ? (
          <p className="p-6 text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : campanas.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-texto-mute)]">Todavía no hay campañas.</p>
        ) : (
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-borde)] text-xs uppercase tracking-wide text-[var(--color-texto-mute)]">
                <th className="px-5 py-3 font-medium">Campaña</th>
                <th className="px-5 py-3 font-medium">Plantilla</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Contactos</th>
                <th className="px-5 py-3 font-medium">Enviados/Entregados/Leídos</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {campanas.map((c) => {
                const stats = estadisticas[c.id] ?? { enviado: 0, entregado: 0, leido: 0, fallido: 0 };
                return (
                  <tr key={c.id} className="border-b border-[var(--color-borde)] last:border-0">
                    <td className="px-5 py-3.5 font-medium text-[var(--color-texto)]">
                      {c.nombre}
                      {c.programado_para && c.status === "borrador" && (
                        <span className="mt-0.5 block text-xs font-normal text-[var(--color-texto-mute)]">
                          Programada: {new Date(c.programado_para).toLocaleString("es-MX")}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-[var(--color-texto-mute)]">{c.templates?.name ?? "—"}</td>
                    <td className="px-5 py-3.5">
                      <Badge tono={TONO_STATUS[c.status]}>{LABEL_STATUS[c.status]}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-[var(--color-texto)]">{c.total_destinatarios}</td>
                    <td className="px-5 py-3.5 text-[var(--color-texto)]">
                      {stats.enviado}/{stats.entregado}/{stats.leido} de {c.total_destinatarios}
                      {stats.fallido > 0 && <span className="ml-1 text-red-500">({stats.fallido} fallidos)</span>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right">
                      {(c.status === "borrador" || c.status === "pausada") && (
                        <button onClick={() => setCargandoContactosDe(c)} className="mr-3 text-sm font-medium text-[var(--color-marca)] hover:underline">
                          Cargar contactos
                        </button>
                      )}
                      {(c.status === "borrador" || c.status === "pausada") && c.total_destinatarios > 0 && (
                        <button onClick={() => enviarAhora(c.id)} className="mr-3 text-sm font-medium text-[var(--color-marca)] hover:underline">
                          Enviar ahora
                        </button>
                      )}
                      {c.status === "enviando" && (
                        <button onClick={() => pausar(c.id)} className="mr-3 text-sm font-medium text-[var(--color-texto)] hover:underline">
                          Pausar
                        </button>
                      )}
                      <button onClick={() => eliminar(c.id)} className="text-sm font-medium text-red-500 hover:underline">
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CampanaForm({
  cuentaId,
  templatesAprobados,
  etiquetas,
  onCreada,
  onTemplatesCambiados,
}: {
  cuentaId: string;
  templatesAprobados: Template[];
  etiquetas: { id: string; nombre: string }[];
  onCreada: () => void;
  onTemplatesCambiados: () => void;
}) {
  const supabase = createClient();
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("MARKETING");
  const [modo, setModo] = useState<"existente" | "nueva">("existente");
  const [templateId, setTemplateId] = useState("");
  const [etiquetaId, setEtiquetaId] = useState("");
  const [programadoPara, setProgramadoPara] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarAsistente, setMostrarAsistente] = useState(false);

  const templatesFiltrados = templatesAprobados.filter((t) => t.categoria === tipo);

  async function crear() {
    setEnviando(true);
    setError(null);

    const { error } = await supabase.from("campanas").insert({
      cuenta_id: cuentaId,
      nombre: nombre.trim(),
      template_id: templateId || null,
      etiqueta_id: etiquetaId || null,
      programado_para: programadoPara ? new Date(programadoPara).toISOString() : null,
    });

    setEnviando(false);

    if (error) {
      setError(error.message);
      return;
    }

    onCreada();
  }

  return (
    <div className="mb-2 max-w-xl space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
      <h2 className="text-base font-semibold text-[var(--color-texto)]">Nueva campaña</h2>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nombre de la campaña</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT} />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Tipo</span>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className={INPUT}>
          {Object.entries(LABEL_CATEGORIA).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">Solo filtra qué plantillas aprobadas aparecen abajo.</span>
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setModo("existente")}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${modo === "existente" ? "border-[var(--color-marca)] bg-[var(--color-marca)] text-white" : "border-[var(--color-borde)] text-[var(--color-texto-mute)]"}`}
        >
          Usar plantilla existente
        </button>
        <button
          type="button"
          onClick={() => setModo("nueva")}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${modo === "nueva" ? "border-[var(--color-marca)] bg-[var(--color-marca)] text-white" : "border-[var(--color-borde)] text-[var(--color-texto-mute)]"}`}
        >
          Crear plantilla nueva
        </button>
      </div>

      {modo === "existente" ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Plantilla de WhatsApp aprobada</span>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={INPUT}>
            <option value="">Sin plantilla</option>
            {templatesFiltrados.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {templatesFiltrados.length === 0 && (
            <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">No hay plantillas aprobadas de este tipo todavía.</span>
          )}
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setMostrarAsistente(true)}
          className="w-full rounded-lg border border-dashed border-[var(--color-borde)] px-3 py-2 text-sm font-medium text-[var(--color-marca)] hover:bg-[var(--color-bg-elevada)]"
        >
          + Abrir asistente de plantillas
        </button>
      )}

      {templateId && modo === "existente" && (
        <p className="text-xs text-[var(--color-texto-mute)]">
          Plantilla lista para usar: {templatesAprobados.find((t) => t.id === templateId)?.name}
        </p>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Etiquetar contactos con (opcional)</span>
        <select value={etiquetaId} onChange={(e) => setEtiquetaId(e.target.value)} className={INPUT}>
          <option value="">Sin etiqueta</option>
          {etiquetas.map((et) => (
            <option key={et.id} value={et.id}>
              {et.nombre}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
          Al enviar, esta etiqueta se agrega automáticamente a cada contacto que reciba el mensaje. Si no cargas
          contactos por CSV, también se usa para elegir a quién se le manda.
        </span>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Programar para (opcional)</span>
        <input type="datetime-local" value={programadoPara} onChange={(e) => setProgramadoPara(e.target.value)} className={INPUT} />
      </label>

      <p className="text-xs text-[var(--color-texto-mute)]">
        Después de crear la campaña, carga los contactos a los que se enviará desde un archivo CSV (botón &ldquo;Cargar
        contactos&rdquo; en la lista).
      </p>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={crear}
          disabled={enviando || !nombre.trim()}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {enviando ? "Creando…" : "Crear campaña"}
        </button>
      </div>

      {mostrarAsistente && (
        <AsistentePlantillaModal
          cuentaId={cuentaId}
          plantilla={null}
          onGuardado={(nuevoTemplateId) => {
            setMostrarAsistente(false);
            setModo("existente");
            if (nuevoTemplateId) setTemplateId(nuevoTemplateId);
            onTemplatesCambiados();
          }}
          onCancelar={() => setMostrarAsistente(false)}
        />
      )}
    </div>
  );
}

function CargarContactosModal({
  campana,
  perfiles,
  onListo,
  onCancelar,
}: {
  campana: Campana;
  perfiles: PerfilLite[];
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [pais, setPais] = useState<"MX">("MX");
  const [asignadoA, setAsignadoA] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    importados: number;
    actualizados: number;
    omitidos: { fila: number; motivo: string }[];
    columnas_ignoradas: string[];
    contactos: ContactoImportado[];
  } | null>(null);

  async function subir() {
    if (!archivo) return;
    setSubiendo(true);
    setError(null);

    const formData = new FormData();
    formData.append("archivo", archivo);
    formData.append("pais", pais);
    if (asignadoA) formData.append("asignado_a", asignadoA);

    const res = await fetch(`/api/campanas/${campana.id}/cargar-contactos`, { method: "POST", body: formData });
    const data = await res.json();
    setSubiendo(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo cargar el archivo");
      return;
    }

    setResultado(data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <h2 className="mb-4 text-base font-semibold text-[var(--color-texto)]">Cargar contactos — {campana.nombre}</h2>

        {!resultado ? (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">País de los teléfonos</span>
              <select value={pais} onChange={(e) => setPais(e.target.value as "MX")} className={INPUT}>
                <option value="MX">México (+52)</option>
              </select>
              <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
                Formato de teléfono: se normaliza automáticamente a 521 + 10 dígitos (con o sin +52 / 1), ej. 9811234567
                o 5219811234567.
              </span>
            </label>

            {perfiles.length > 0 && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Asignar a (opcional)</span>
                <select value={asignadoA} onChange={(e) => setAsignadoA(e.target.value)} className={INPUT}>
                  <option value="">Sin asignar</option>
                  {perfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre ?? "Sin nombre"}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
                  Solo aplica a los contactos que se creen nuevos con este archivo.
                </span>
              </label>
            )}

            <a
              href="/api/contactos/plantilla-csv"
              className="inline-block text-sm font-medium text-[var(--color-marca)] hover:underline"
            >
              Descargar plantilla CSV
            </a>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Archivo CSV</span>
              <input type="file" accept=".csv,text/csv" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="text-sm text-[var(--color-texto)]" />
            </label>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={subir}
                disabled={!archivo || subiendo}
                style={{ boxShadow: "var(--halo-accion)" }}
                className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {subiendo ? "Subiendo…" : "Subir archivo"}
              </button>
              <button onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <RevisionContactosImportados resultado={resultado} onListo={onListo} />
        )}
      </div>
    </div>
  );
}

const COLUMNAS_REVISION = [
  { id: "telefono", etiqueta: "Teléfono" },
  { id: "nombre_completo", etiqueta: "Nombre completo" },
  { id: "correo_electronico", etiqueta: "Correo" },
  { id: "etiquetas", etiqueta: "Etiquetas" },
  { id: "canal_origen", etiqueta: "Origen" },
] as const;

function RevisionContactosImportados({
  resultado,
  onListo,
}: {
  resultado: { importados: number; actualizados: number; omitidos: { fila: number; motivo: string }[]; columnas_ignoradas: string[]; contactos: ContactoImportado[] };
  onListo: () => void;
}) {
  const [columnasVisibles, setColumnasVisibles] = useState<Set<string>>(new Set(COLUMNAS_REVISION.map((c) => c.id)));

  function alternar(id: string) {
    setColumnasVisibles((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 rounded-lg border border-[var(--color-borde)] p-3 text-sm">
        <span className="font-medium text-[var(--color-en-vivo)]">{resultado.importados} nuevos</span>
        <span className="font-medium text-[var(--color-marca)]">{resultado.actualizados} actualizados</span>
        {resultado.omitidos.length > 0 && <span className="font-medium text-red-500">{resultado.omitidos.length} omitidos</span>}
      </div>

      {resultado.columnas_ignoradas.length > 0 && (
        <p className="text-xs text-amber-600">Columnas del CSV no reconocidas (se ignoraron): {resultado.columnas_ignoradas.join(", ")}</p>
      )}

      {resultado.omitidos.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-500">
          {resultado.omitidos.map((o) => (
            <p key={o.fila}>
              Fila {o.fila}: {o.motivo}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs">
        {COLUMNAS_REVISION.map((c) => (
          <label key={c.id} className="flex items-center gap-1.5 text-[var(--color-texto-mute)]">
            <input type="checkbox" checked={columnasVisibles.has(c.id)} onChange={() => alternar(c.id)} />
            {c.etiqueta}
          </label>
        ))}
      </div>

      <div className="max-h-72 overflow-auto rounded-lg border border-[var(--color-borde)]">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--color-borde)] text-[var(--color-texto-mute)]">
              {COLUMNAS_REVISION.filter((c) => columnasVisibles.has(c.id)).map((c) => (
                <th key={c.id} className="px-3 py-2 font-medium">
                  {c.etiqueta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resultado.contactos.map((c) => (
              <tr key={c.id} className="border-b border-[var(--color-borde)] last:border-0">
                {columnasVisibles.has("telefono") && <td className="px-3 py-2">{c.telefono}</td>}
                {columnasVisibles.has("nombre_completo") && <td className="px-3 py-2">{c.nombre_completo ?? "—"}</td>}
                {columnasVisibles.has("correo_electronico") && <td className="px-3 py-2">{c.correo_electronico ?? "—"}</td>}
                {columnasVisibles.has("etiquetas") && <td className="px-3 py-2">{c.etiquetas.join(", ") || "—"}</td>}
                {columnasVisibles.has("canal_origen") && <td className="px-3 py-2">{c.canal_origen ?? "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={onListo}
        style={{ boxShadow: "var(--halo-accion)" }}
        className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
      >
        Listo
      </button>
    </div>
  );
}
