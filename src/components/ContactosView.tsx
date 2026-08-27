"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/Badge";
import type { CampoPersonalizado } from "@/lib/campos-personalizados";

type Contacto = {
  id: string;
  telefono: string;
  nombre: string | null;
  nombre_completo: string | null;
  etiquetas: string[];
  status: "activo" | "inactivo";
  canal_origen: string | null;
  created_at: string;
};

export function ContactosView({ cuentaId }: { cuentaId: string }) {
  const supabase = createClient();
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [etiquetasCatalogo, setEtiquetasCatalogo] = useState<string[]>([]);
  const [camposPersonalizados, setCamposPersonalizados] = useState<CampoPersonalizado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<Contacto | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  async function cargar() {
    setCargando(true);
    const [{ data: c }, { data: e }, { data: cp }] = await Promise.all([
      supabase.from("contactos").select("*").order("created_at", { ascending: false }),
      supabase.from("etiquetas").select("nombre").order("nombre"),
      supabase.from("campos_personalizados").select("*").order("orden"),
    ]);
    setContactos(c ?? []);
    setEtiquetasCatalogo((e ?? []).map((x) => x.nombre));
    setCamposPersonalizados((cp as CampoPersonalizado[]) ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return contactos;
    return contactos.filter(
      (c) => c.nombre?.toLowerCase().includes(q) || c.telefono.includes(q) || c.etiquetas.some((et) => et.toLowerCase().includes(q)),
    );
  }, [contactos, busqueda]);

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
                <th className="px-5 py-3 font-medium">Nombre</th>
                <th className="px-5 py-3 font-medium">Nombre completo</th>
                <th className="px-5 py-3 font-medium">Teléfono</th>
                <th className="px-5 py-3 font-medium">Etiquetas</th>
                <th className="px-5 py-3 font-medium">Canal</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id} className="border-b border-[var(--color-borde)] last:border-0">
                  <td className="px-5 py-3.5 text-[var(--color-texto)]">{c.nombre ?? "—"}</td>
                  <td className="px-5 py-3.5 text-[var(--color-texto)]">{c.nombre_completo ?? "—"}</td>
                  <td className="px-5 py-3.5 text-[var(--color-texto)]">{c.telefono}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {c.etiquetas.length === 0 ? (
                        <span className="text-[var(--color-texto-mute)]">—</span>
                      ) : (
                        c.etiquetas.map((et) => (
                          <Badge key={et} tono="ia">
                            {et}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-texto-mute)]">{c.canal_origen ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    <Badge tono={c.status === "activo" ? "en-vivo" : "mute"}>
                      {c.status === "activo" ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
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
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Teléfono</span>
          <input
            required
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="5215600000000"
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
        camposPersonalizados.length > 0 && (
          <div className="space-y-4 border-t border-[var(--color-borde)] pt-4">
            {camposPersonalizados.map((campo) => (
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
