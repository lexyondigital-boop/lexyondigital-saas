"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Template } from "@/components/PlantillasView";
import { CampoVariableForm } from "@/components/CampoVariableForm";
import type { CampoPersonalizado } from "@/lib/campos-personalizados";

const INPUT =
  "w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]";

type Tab = "plantilla" | "mensaje" | "archivo" | "encabezado" | "footer" | "botones" | "tarjetas" | "webhook" | "etiquetas" | "etapa";

const TABS: { id: Tab; label: string }[] = [
  { id: "plantilla", label: "Plantilla" },
  { id: "mensaje", label: "Mensaje" },
  { id: "archivo", label: "Archivo" },
  { id: "encabezado", label: "Encabezado" },
  { id: "footer", label: "Mensaje Inferior" },
  { id: "botones", label: "Botones" },
  { id: "tarjetas", label: "Tarjetas" },
  { id: "webhook", label: "Webhook" },
  { id: "etiquetas", label: "Etiquetas" },
  { id: "etapa", label: "Etapa" },
];

type HeaderTipo = "ninguno" | "texto" | "imagen" | "video" | "documento";
type CtaTipo = "URL" | "PHONE_NUMBER";
type Boton = { type: "QUICK_REPLY" | CtaTipo; text: string; url?: string; phone_number?: string };
type Tarjeta = { media_tipo: "imagen" | "video"; media_url: string; media_handle: string | null; body: string; body_ejemplos: string[]; botones: Boton[] };
type CuentaWhatsapp = { id: string; phone_number_id: string; estado: string };
type Etiqueta = { id: string; nombre: string; color: string };
type Etapa = { id: string; nombre: string; color: string };

function detectarVariables(texto: string): number[] {
  const nums = new Set<number>();
  for (const m of texto.matchAll(/\{\{(\d+)\}\}/g)) nums.add(Number(m[1]));
  return [...nums].sort((a, b) => a - b);
}

function siguienteVariable(texto: string): string {
  const vars = detectarVariables(texto);
  const siguiente = vars.length ? Math.max(...vars) + 1 : 1;
  return `{{${siguiente}}}`;
}

async function subirMedia(archivo: File, cuentaWhatsappId: string): Promise<{ url: string | null; handle: string | null; error: string | null }> {
  const formData = new FormData();
  formData.append("archivo", archivo);
  formData.append("cuenta_whatsapp_id", cuentaWhatsappId);
  const res = await fetch("/api/plantillas/media", { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) return { url: null, handle: null, error: data.error ?? "No se pudo subir el archivo" };
  return { url: data.url ?? null, handle: data.handle ?? null, error: data.error ?? null };
}

// Combobox de búsqueda + selección + "crear nueva" para ligar un {{n}} (o el
// único variable del encabezado) a un campo real de Variables -- mismo
// concepto que el buscador de contactos, pero acotado a campos con
// clave_variable (los que sí se pueden usar como marcador).
function SelectorVariable({
  valor,
  variables,
  onSeleccionar,
  onCrear,
  disabled,
}: {
  valor: string | null;
  variables: CampoPersonalizado[];
  onSeleccionar: (clave: string | null) => void;
  onCrear: (textoBusqueda: string) => void;
  disabled?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const seleccionado = variables.find((v) => v.clave_variable === valor);
  const filtradas = variables.filter(
    (v) => !busqueda.trim() || v.nombre.toLowerCase().includes(busqueda.toLowerCase()) || v.clave_variable?.toLowerCase().includes(busqueda.toLowerCase()),
  );
  const hayCoincidenciaExacta = variables.some((v) => v.nombre.toLowerCase() === busqueda.trim().toLowerCase());

  return (
    <div ref={ref} className="relative">
      {seleccionado ? (
        <div className="flex items-center justify-between rounded-lg border border-[var(--color-marca)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm">
          <span className="text-[var(--color-texto)]">
            {seleccionado.nombre} <span className="font-mono text-xs text-[var(--color-texto-mute)]">{`{{${seleccionado.clave_variable}}}`}</span>
          </span>
          {!disabled && (
            <button type="button" onClick={() => onSeleccionar(null)} className="text-xs text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
              ✕
            </button>
          )}
        </div>
      ) : (
        <input
          value={busqueda}
          disabled={disabled}
          onFocus={() => setAbierto(true)}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setAbierto(true);
          }}
          placeholder="Buscar o crear una variable…"
          className={INPUT}
        />
      )}
      {abierto && !seleccionado && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[var(--color-borde)] bg-[var(--color-tarjeta)] shadow-lg">
          {filtradas.length === 0 && <p className="px-3 py-2 text-xs text-[var(--color-texto-mute)]">Sin variables creadas todavía.</p>}
          {filtradas.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                onSeleccionar(v.clave_variable);
                setBusqueda("");
                setAbierto(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-[var(--color-texto)] hover:bg-[var(--color-bg-elevada)]"
            >
              {v.nombre} <span className="font-mono text-xs text-[var(--color-texto-mute)]">{`{{${v.clave_variable}}}`}</span>
            </button>
          ))}
          {busqueda.trim() && !hayCoincidenciaExacta && (
            <button
              type="button"
              onClick={() => {
                onCrear(busqueda.trim());
                setAbierto(false);
              }}
              className="block w-full border-t border-[var(--color-borde)] px-3 py-2 text-left text-sm font-medium text-[var(--color-marca)] hover:bg-[var(--color-bg-elevada)]"
            >
              + Crear variable &ldquo;{busqueda.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function AsistentePlantillaModal({
  cuentaId,
  plantilla,
  onGuardado,
  onCancelar,
}: {
  cuentaId: string;
  plantilla: Template | null;
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const supabase = createClient();
  const soloConfiguracionLocal = plantilla?.status === "approved";

  const [tab, setTab] = useState<Tab>("plantilla");
  const [cuentasWhatsapp, setCuentasWhatsapp] = useState<CuentaWhatsapp[]>([]);
  const [etiquetasCuenta, setEtiquetasCuenta] = useState<Etiqueta[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [variablesDisponibles, setVariablesDisponibles] = useState<CampoPersonalizado[]>([]);
  const [crearVariablePara, setCrearVariablePara] = useState<number | "header" | null>(null);

  const [nombre, setNombre] = useState(plantilla?.name ?? "");
  const [categoria, setCategoria] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">(plantilla?.categoria ?? "MARKETING");
  const [idioma, setIdioma] = useState(plantilla?.language ?? "es_MX");
  const [cuentaWhatsappId, setCuentaWhatsappId] = useState(plantilla?.cuenta_whatsapp_id ?? "");

  const [body, setBody] = useState(plantilla?.body ?? "");
  const [bodyEjemplos, setBodyEjemplos] = useState<string[]>(plantilla?.variables ?? []);
  const [bodyClaves, setBodyClaves] = useState<(string | null)[]>(plantilla?.variables_mapeo ?? []);

  const [headerTipo, setHeaderTipo] = useState<HeaderTipo>(plantilla?.header_tipo ?? "ninguno");
  const [headerTexto, setHeaderTexto] = useState(plantilla?.header_texto ?? "");
  const [headerTextoEjemplo, setHeaderTextoEjemplo] = useState(plantilla?.header_texto_ejemplo ?? "");
  const [headerVariableClave, setHeaderVariableClave] = useState<string | null>(plantilla?.header_variable_clave ?? null);
  const [headerMediaUrl, setHeaderMediaUrl] = useState<string | null>(plantilla?.header_media_url ?? null);
  const [headerMediaHandle, setHeaderMediaHandle] = useState<string | null>(plantilla?.header_media_handle ?? null);
  const [subiendoHeader, setSubiendoHeader] = useState(false);
  const [avisoHeaderMedia, setAvisoHeaderMedia] = useState<string | null>(null);

  const [footerTexto, setFooterTexto] = useState(plantilla?.footer_texto ?? "");

  const botonesIniciales = plantilla?.botones ?? [];
  const [respuestasRapidas, setRespuestasRapidas] = useState<string[]>(
    botonesIniciales.filter((b) => b.type === "QUICK_REPLY").map((b) => b.text),
  );
  const [ctas, setCtas] = useState<{ tipo: CtaTipo; text: string; url: string; phone_number: string }[]>(
    botonesIniciales
      .filter((b) => b.type !== "QUICK_REPLY")
      .map((b) => ({ tipo: b.type as CtaTipo, text: b.text, url: b.url ?? "", phone_number: b.phone_number ?? "" })),
  );

  const [usaCarrusel, setUsaCarrusel] = useState(plantilla?.usa_carrusel ?? false);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>(plantilla?.tarjetas ?? []);
  const [subiendoTarjeta, setSubiendoTarjeta] = useState<number | null>(null);

  const [webhookUrl, setWebhookUrl] = useState(plantilla?.webhook_url ?? "");
  const [webhookHeaders, setWebhookHeaders] = useState<{ key: string; value: string }[]>(
    Object.entries(plantilla?.webhook_headers ?? {}).map(([key, value]) => ({ key, value })),
  );

  const [etiquetasSeleccionadas, setEtiquetasSeleccionadas] = useState<string[]>(plantilla?.etiquetas_envio ?? []);
  const [busquedaEtiqueta, setBusquedaEtiqueta] = useState("");
  const [creandoEtiqueta, setCreandoEtiqueta] = useState(false);
  const [etapaDestinoId, setEtapaDestinoId] = useState<string | null>(plantilla?.etapa_destino_id ?? null);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargarVariables() {
    const { data } = await supabase.from("campos_personalizados").select("*").eq("cuenta_id", cuentaId).not("clave_variable", "is", null).order("orden");
    setVariablesDisponibles((data as CampoPersonalizado[]) ?? []);
  }

  useEffect(() => {
    async function cargarCatalogos() {
      const [{ data: cw }, { data: et }, { data: ep }] = await Promise.all([
        supabase.from("cuentas_whatsapp").select("id, phone_number_id, estado").eq("cuenta_id", cuentaId).eq("estado", "activo"),
        supabase.from("etiquetas").select("id, nombre, color").eq("cuenta_id", cuentaId).order("nombre"),
        supabase.from("etapas_pipeline").select("id, nombre, color").eq("cuenta_id", cuentaId).order("orden"),
      ]);
      setCuentasWhatsapp(cw ?? []);
      setEtiquetasCuenta(et ?? []);
      setEtapas(ep ?? []);
    }
    cargarCatalogos();
    cargarVariables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuentaId]);

  const variablesBody = useMemo(() => detectarVariables(body), [body]);
  useEffect(() => {
    setBodyEjemplos((prev) => variablesBody.map((_, i) => prev[i] ?? ""));
    setBodyClaves((prev) => variablesBody.map((_, i) => prev[i] ?? null));
  }, [variablesBody]);

  function alGuardarVariableCreada(claveCreada: string | null) {
    const slot = crearVariablePara;
    setCrearVariablePara(null);
    if (!claveCreada) return;
    cargarVariables().then(() => {
      if (slot === "header") setHeaderVariableClave(claveCreada);
      else if (typeof slot === "number") setBodyClaves((prev) => prev.map((v, idx) => (idx === slot ? claveCreada : v)));
    });
  }

  async function crearEtiqueta(nombreNueva: string) {
    setCreandoEtiqueta(true);
    const { data, error } = await supabase.from("etiquetas").insert({ cuenta_id: cuentaId, nombre: nombreNueva }).select().single();
    setCreandoEtiqueta(false);
    if (error || !data) return;
    setEtiquetasCuenta((prev) => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setEtiquetasSeleccionadas((prev) => [...prev, data.nombre]);
    setBusquedaEtiqueta("");
  }

  async function elegirArchivoHeader(archivo: File) {
    if (!cuentaWhatsappId) {
      setAvisoHeaderMedia("Elige primero el número de WhatsApp en la pestaña Plantilla");
      return;
    }
    setSubiendoHeader(true);
    setAvisoHeaderMedia(null);
    const resultado = await subirMedia(archivo, cuentaWhatsappId);
    setSubiendoHeader(false);
    setHeaderMediaUrl(resultado.url);
    setHeaderMediaHandle(resultado.handle);
    if (resultado.error) setAvisoHeaderMedia(resultado.error);
  }

  async function elegirArchivoTarjeta(index: number, archivo: File, tipo: "imagen" | "video") {
    if (!cuentaWhatsappId) return;
    setSubiendoTarjeta(index);
    const resultado = await subirMedia(archivo, cuentaWhatsappId);
    setSubiendoTarjeta(null);
    setTarjetas((prev) =>
      prev.map((t, i) => (i === index ? { ...t, media_tipo: tipo, media_url: resultado.url ?? t.media_url, media_handle: resultado.handle } : t)),
    );
  }

  function agregarTarjeta() {
    if (tarjetas.length >= 10) return;
    setTarjetas((prev) => [...prev, { media_tipo: "imagen", media_url: "", media_handle: null, body: "", body_ejemplos: [], botones: [] }]);
  }

  function quitarTarjeta(index: number) {
    setTarjetas((prev) => prev.filter((_, i) => i !== index));
  }

  function elegirTipoArchivo(tipo: "ninguno" | "imagen" | "video" | "documento") {
    setHeaderTipo(tipo);
    if (tipo === "ninguno") {
      setHeaderMediaUrl(null);
      setHeaderMediaHandle(null);
    }
  }

  function elegirTipoEncabezado(tipo: "ninguno" | "texto") {
    setHeaderTipo(tipo);
    if (tipo === "ninguno") {
      setHeaderTexto("");
      setHeaderTextoEjemplo("");
      setHeaderVariableClave(null);
    }
  }

  async function guardar() {
    setGuardando(true);
    setError(null);

    const botones: Boton[] = [
      ...respuestasRapidas.filter((t) => t.trim()).map((t) => ({ type: "QUICK_REPLY" as const, text: t.trim() })),
      ...ctas
        .filter((c) => c.text.trim())
        .map((c) => ({ type: c.tipo, text: c.text.trim(), ...(c.tipo === "URL" ? { url: c.url.trim() } : { phone_number: c.phone_number.trim() }) })),
    ];

    const payload = {
      nombre: nombre.trim(),
      categoria,
      idioma: idioma.trim(),
      cuenta_whatsapp_id: cuentaWhatsappId,
      body: body.trim(),
      body_ejemplos: bodyEjemplos,
      variables_mapeo: bodyClaves,
      header_tipo: headerTipo,
      header_texto: headerTipo === "texto" ? headerTexto.trim() || null : null,
      header_texto_ejemplo: headerTextoEjemplo.trim() || null,
      header_variable_clave: headerTipo === "texto" ? headerVariableClave : null,
      header_media_url: headerTipo !== "ninguno" && headerTipo !== "texto" ? headerMediaUrl : null,
      header_media_handle: headerTipo !== "ninguno" && headerTipo !== "texto" ? headerMediaHandle : null,
      footer_texto: footerTexto.trim() || null,
      botones: usaCarrusel ? [] : botones,
      usa_carrusel: usaCarrusel,
      tarjetas: usaCarrusel ? tarjetas : [],
      webhook_url: webhookUrl.trim() || null,
      webhook_headers: Object.fromEntries(webhookHeaders.filter((h) => h.key.trim()).map((h) => [h.key.trim(), h.value])),
      etiquetas_envio: etiquetasSeleccionadas,
      etapa_destino_id: etapaDestinoId,
    };

    const res = plantilla
      ? await fetch(`/api/plantillas/${plantilla.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(soloConfiguracionLocal ? { etiquetas_envio: payload.etiquetas_envio, etapa_destino_id: payload.etapa_destino_id, webhook_url: payload.webhook_url, webhook_headers: payload.webhook_headers } : payload),
        })
      : await fetch("/api/plantillas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    const data = await res.json();
    setGuardando(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar la plantilla");
      return;
    }
    if (data.meta_error) {
      setError(`Se guardó como borrador local. Meta respondió: ${data.meta_error}`);
      return;
    }

    onGuardado();
  }

  const etiquetasFiltradas = etiquetasCuenta.filter((et) => !busquedaEtiqueta.trim() || et.nombre.toLowerCase().includes(busquedaEtiqueta.toLowerCase()));
  const hayEtiquetaExacta = etiquetasCuenta.some((et) => et.nombre.toLowerCase() === busquedaEtiqueta.trim().toLowerCase());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)]">
        <div className="flex w-44 shrink-0 flex-col border-r border-[var(--color-borde)] bg-[var(--color-bg-elevada)] py-4">
          <h2 className="mb-3 px-4 text-sm font-semibold text-[var(--color-texto)]">
            {plantilla ? "Editar plantilla" : "Nueva Plantilla"}
          </h2>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              disabled={soloConfiguracionLocal && !["webhook", "etiquetas", "etapa"].includes(t.id)}
              className={`px-4 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                tab === t.id
                  ? "border-r-2 border-[var(--color-marca)] bg-[var(--color-tarjeta)] font-medium text-[var(--color-marca)]"
                  : "text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6">
            {soloConfiguracionLocal && (
              <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                Esta plantilla ya fue aprobada por Meta -- su contenido ya no se puede editar aquí. Solo puedes ajustar
                las etiquetas, la etapa destino y el webhook. Para cambiar el mensaje, crea una nueva plantilla.
              </p>
            )}

            {tab === "plantilla" && (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nombre de Plantilla</span>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value.toLowerCase())}
                    disabled={soloConfiguracionLocal}
                    placeholder="confirmacion_cita"
                    className={INPUT}
                  />
                  <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">Solo minúsculas, números y guion bajo.</span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Categoría</span>
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value as typeof categoria)} disabled={soloConfiguracionLocal} className={INPUT}>
                    <option value="MARKETING">Marketing</option>
                    <option value="UTILITY">Utilidad</option>
                    <option value="AUTHENTICATION">Autenticación</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Idioma</span>
                  <select value={idioma} onChange={(e) => setIdioma(e.target.value)} disabled={soloConfiguracionLocal} className={INPUT}>
                    <option value="es_MX">Español (México)</option>
                    <option value="es">Español</option>
                    <option value="en_US">Inglés (EE.UU.)</option>
                    <option value="pt_BR">Portugués (Brasil)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Número de WhatsApp</span>
                  <select value={cuentaWhatsappId} onChange={(e) => setCuentaWhatsappId(e.target.value)} disabled={soloConfiguracionLocal} className={INPUT}>
                    <option value="">Selecciona un número</option>
                    {cuentasWhatsapp.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.phone_number_id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {tab === "mensaje" && (
              <div className="space-y-4">
                <label className="block">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--color-texto)]">Cuerpo del Mensaje</span>
                    <button
                      type="button"
                      disabled={soloConfiguracionLocal}
                      onClick={() => setBody((prev) => `${prev} ${siguienteVariable(prev)}`)}
                      className="text-xs font-medium text-[var(--color-marca)] hover:underline disabled:opacity-40"
                    >
                      + Agregar variable
                    </button>
                  </div>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    disabled={soloConfiguracionLocal}
                    rows={6}
                    placeholder="Hola {{1}}, tu cita es el {{2}}."
                    className={INPUT}
                  />
                </label>
                {variablesBody.length > 0 && (
                  <div className="space-y-3 rounded-lg border border-[var(--color-borde)] p-3">
                    <p className="text-xs font-medium text-[var(--color-texto)]">
                      Liga cada variable a un dato real del contacto (opcional) y define su valor de ejemplo para Meta
                    </p>
                    {variablesBody.map((n, i) => (
                      <div key={n} className="space-y-1.5">
                        <span className="block text-xs text-[var(--color-texto-mute)]">{`{{${n}}}`}</span>
                        <SelectorVariable
                          valor={bodyClaves[i] ?? null}
                          variables={variablesDisponibles}
                          disabled={soloConfiguracionLocal}
                          onSeleccionar={(clave) => setBodyClaves((prev) => prev.map((v, idx) => (idx === i ? clave : v)))}
                          onCrear={() => setCrearVariablePara(i)}
                        />
                        <input
                          value={bodyEjemplos[i] ?? ""}
                          disabled={soloConfiguracionLocal}
                          placeholder="Valor de ejemplo para que Meta apruebe la plantilla"
                          onChange={(e) => setBodyEjemplos((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                          className={INPUT}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "archivo" && (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Adjuntar archivo</span>
                  <select
                    value={headerTipo === "texto" ? "ninguno" : headerTipo}
                    disabled={soloConfiguracionLocal || headerTipo === "texto"}
                    onChange={(e) => elegirTipoArchivo(e.target.value as "ninguno" | "imagen" | "video" | "documento")}
                    className={INPUT}
                  >
                    <option value="ninguno">Ninguno</option>
                    <option value="imagen">Imagen</option>
                    <option value="video">Video</option>
                    <option value="documento">Documento</option>
                  </select>
                </label>
                {headerTipo === "texto" ? (
                  <p className="text-xs text-[var(--color-texto-mute)]">
                    Ya tienes un encabezado de texto configurado en la pestaña &ldquo;Encabezado&rdquo;. Quítalo ahí primero si quieres adjuntar un archivo en su lugar.
                  </p>
                ) : headerTipo === "ninguno" ? (
                  <p className="text-xs text-[var(--color-texto-mute)]">
                    Úsalo para mandar un documento (ej. instructivo de uso) o una imagen (ej. una promoción) junto con el mensaje.
                  </p>
                ) : (
                  <>
                    <input
                      type="file"
                      disabled={soloConfiguracionLocal || subiendoHeader}
                      accept={headerTipo === "imagen" ? "image/jpeg,image/png" : headerTipo === "video" ? "video/mp4" : "application/pdf"}
                      onChange={(e) => {
                        const archivo = e.target.files?.[0];
                        if (archivo) elegirArchivoHeader(archivo);
                      }}
                      className="text-sm text-[var(--color-texto)]"
                    />
                    {subiendoHeader && <p className="text-xs text-[var(--color-texto-mute)]">Subiendo…</p>}
                    {headerMediaUrl && !subiendoHeader && (
                      <p className="text-xs text-[var(--color-texto)]">
                        Archivo listo{headerMediaHandle ? "" : " (guardado localmente, aún no sometido a Meta)"}.
                      </p>
                    )}
                    {avisoHeaderMedia && <p className="text-xs text-amber-600">{avisoHeaderMedia}</p>}
                  </>
                )}
              </div>
            )}

            {tab === "encabezado" && (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Seleccionar</span>
                  <select
                    value={headerTipo === "texto" ? "texto" : "ninguno"}
                    disabled={soloConfiguracionLocal || (headerTipo !== "ninguno" && headerTipo !== "texto")}
                    onChange={(e) => elegirTipoEncabezado(e.target.value as "ninguno" | "texto")}
                    className={INPUT}
                  >
                    <option value="ninguno">Ninguno</option>
                    <option value="texto">Texto</option>
                  </select>
                </label>
                {headerTipo !== "ninguno" && headerTipo !== "texto" ? (
                  <p className="text-xs text-[var(--color-texto-mute)]">
                    Ya tienes un archivo adjunto configurado en la pestaña &ldquo;Archivo&rdquo;. Quítalo ahí primero si quieres usar un encabezado de texto en su lugar.
                  </p>
                ) : (
                  headerTipo === "texto" && (
                    <>
                      <label className="block">
                        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Texto del Encabezado</span>
                        <input
                          value={headerTexto}
                          onChange={(e) => setHeaderTexto(e.target.value)}
                          disabled={soloConfiguracionLocal}
                          maxLength={60}
                          placeholder="Principal {{1}}"
                          className={INPUT}
                        />
                        <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">{headerTexto.length}/60 -- admite máximo 1 variable.</span>
                      </label>
                      {detectarVariables(headerTexto).length > 0 && (
                        <div className="space-y-2">
                          <SelectorVariable
                            valor={headerVariableClave}
                            variables={variablesDisponibles}
                            disabled={soloConfiguracionLocal}
                            onSeleccionar={setHeaderVariableClave}
                            onCrear={() => setCrearVariablePara("header")}
                          />
                          <label className="block">
                            <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Valor de ejemplo</span>
                            <input value={headerTextoEjemplo} onChange={(e) => setHeaderTextoEjemplo(e.target.value)} disabled={soloConfiguracionLocal} className={INPUT} />
                          </label>
                        </div>
                      )}
                    </>
                  )
                )}
              </div>
            )}

            {tab === "footer" && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Mensaje Inferior</span>
                <input value={footerTexto} onChange={(e) => setFooterTexto(e.target.value)} disabled={soloConfiguracionLocal} maxLength={60} className={INPUT} />
                <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">{footerTexto.length}/60 -- no admite variables.</span>
              </label>
            )}

            {tab === "botones" && (
              <div className="space-y-6">
                <div>
                  <p className="mb-2 text-sm font-medium text-[var(--color-texto)]">Respuesta Rápida (máx. 3)</p>
                  {respuestasRapidas.map((r, i) => (
                    <div key={i} className="mb-2 flex gap-2">
                      <input
                        value={r}
                        disabled={soloConfiguracionLocal}
                        onChange={(e) => setRespuestasRapidas((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                        className={INPUT}
                      />
                      <button type="button" disabled={soloConfiguracionLocal} onClick={() => setRespuestasRapidas((prev) => prev.filter((_, idx) => idx !== i))} className="text-xs text-red-500">
                        Quitar
                      </button>
                    </div>
                  ))}
                  {respuestasRapidas.length < 3 && (
                    <button type="button" disabled={soloConfiguracionLocal} onClick={() => setRespuestasRapidas((prev) => [...prev, ""])} className="text-xs font-medium text-[var(--color-marca)] hover:underline">
                      + Respuesta Rápida
                    </button>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-[var(--color-texto)]">Llamada a la Acción (máx. 2)</p>
                  {ctas.map((c, i) => (
                    <div key={i} className="mb-2 space-y-2 rounded-lg border border-[var(--color-borde)] p-3">
                      <div className="flex gap-2">
                        <select
                          value={c.tipo}
                          disabled={soloConfiguracionLocal}
                          onChange={(e) => setCtas((prev) => prev.map((v, idx) => (idx === i ? { ...v, tipo: e.target.value as CtaTipo } : v)))}
                          className={INPUT}
                        >
                          <option value="URL">Ir a sitio web</option>
                          <option value="PHONE_NUMBER">Llamar por teléfono</option>
                        </select>
                        <button type="button" disabled={soloConfiguracionLocal} onClick={() => setCtas((prev) => prev.filter((_, idx) => idx !== i))} className="shrink-0 text-xs text-red-500">
                          Quitar
                        </button>
                      </div>
                      <input
                        value={c.text}
                        disabled={soloConfiguracionLocal}
                        placeholder="Texto del botón"
                        onChange={(e) => setCtas((prev) => prev.map((v, idx) => (idx === i ? { ...v, text: e.target.value } : v)))}
                        className={INPUT}
                      />
                      {c.tipo === "URL" ? (
                        <input
                          value={c.url}
                          disabled={soloConfiguracionLocal}
                          placeholder="https://…"
                          onChange={(e) => setCtas((prev) => prev.map((v, idx) => (idx === i ? { ...v, url: e.target.value } : v)))}
                          className={INPUT}
                        />
                      ) : (
                        <input
                          value={c.phone_number}
                          disabled={soloConfiguracionLocal}
                          placeholder="+52…"
                          onChange={(e) => setCtas((prev) => prev.map((v, idx) => (idx === i ? { ...v, phone_number: e.target.value } : v)))}
                          className={INPUT}
                        />
                      )}
                    </div>
                  ))}
                  {ctas.length < 2 && (
                    <button
                      type="button"
                      disabled={soloConfiguracionLocal}
                      onClick={() => setCtas((prev) => [...prev, { tipo: "URL", text: "", url: "", phone_number: "" }])}
                      className="text-xs font-medium text-[var(--color-marca)] hover:underline"
                    >
                      + Agregar CTA
                    </button>
                  )}
                </div>
              </div>
            )}

            {tab === "tarjetas" && (
              <div className="space-y-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={usaCarrusel} disabled={soloConfiguracionLocal} onChange={(e) => setUsaCarrusel(e.target.checked)} />
                  <span className="text-sm font-medium text-[var(--color-texto)]">Usar carrusel de tarjetas</span>
                </label>
                <p className="text-xs text-[var(--color-texto-mute)]">
                  Envía un carrusel de 2 a 10 tarjetas. Al usar carrusel no se permiten encabezado, mensaje inferior, archivo ni botones principales.
                </p>
                {usaCarrusel && (
                  <div className="space-y-4">
                    {tarjetas.map((t, i) => (
                      <div key={i} className="space-y-2 rounded-lg border border-[var(--color-borde)] p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[var(--color-texto)]">Tarjeta {i + 1}</span>
                          <button type="button" disabled={soloConfiguracionLocal} onClick={() => quitarTarjeta(i)} className="text-xs text-red-500">
                            Quitar
                          </button>
                        </div>
                        <select
                          value={t.media_tipo}
                          disabled={soloConfiguracionLocal}
                          onChange={(e) => setTarjetas((prev) => prev.map((v, idx) => (idx === i ? { ...v, media_tipo: e.target.value as "imagen" | "video" } : v)))}
                          className={INPUT}
                        >
                          <option value="imagen">Imagen</option>
                          <option value="video">Video</option>
                        </select>
                        <input
                          type="file"
                          disabled={soloConfiguracionLocal || subiendoTarjeta === i}
                          accept={t.media_tipo === "imagen" ? "image/jpeg,image/png" : "video/mp4"}
                          onChange={(e) => {
                            const archivo = e.target.files?.[0];
                            if (archivo) elegirArchivoTarjeta(i, archivo, t.media_tipo);
                          }}
                          className="text-sm text-[var(--color-texto)]"
                        />
                        {subiendoTarjeta === i && <p className="text-xs text-[var(--color-texto-mute)]">Subiendo…</p>}
                        {t.media_url && <p className="text-xs text-[var(--color-texto)]">Archivo listo{t.media_handle ? "" : " (falta sometido a Meta)"}.</p>}
                        <textarea
                          value={t.body}
                          disabled={soloConfiguracionLocal}
                          placeholder="Mensaje de la tarjeta"
                          onChange={(e) => setTarjetas((prev) => prev.map((v, idx) => (idx === i ? { ...v, body: e.target.value } : v)))}
                          rows={2}
                          className={INPUT}
                        />
                      </div>
                    ))}
                    {tarjetas.length < 10 && (
                      <button type="button" disabled={soloConfiguracionLocal} onClick={agregarTarjeta} className="text-xs font-medium text-[var(--color-marca)] hover:underline">
                        + Agregar tarjeta
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === "webhook" && (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">URL</span>
                  <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://…" className={INPUT} />
                </label>
                <div>
                  <p className="mb-2 text-sm font-medium text-[var(--color-texto)]">Headers</p>
                  {webhookHeaders.map((h, i) => (
                    <div key={i} className="mb-2 flex gap-2">
                      <input
                        value={h.key}
                        placeholder="key"
                        onChange={(e) => setWebhookHeaders((prev) => prev.map((v, idx) => (idx === i ? { ...v, key: e.target.value } : v)))}
                        className={INPUT}
                      />
                      <input
                        value={h.value}
                        placeholder="value"
                        onChange={(e) => setWebhookHeaders((prev) => prev.map((v, idx) => (idx === i ? { ...v, value: e.target.value } : v)))}
                        className={INPUT}
                      />
                      <button type="button" onClick={() => setWebhookHeaders((prev) => prev.filter((_, idx) => idx !== i))} className="text-xs text-red-500">
                        ✕
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setWebhookHeaders((prev) => [...prev, { key: "", value: "" }])} className="text-xs font-medium text-[var(--color-marca)] hover:underline">
                    + Agregar header
                  </button>
                </div>
                <p className="text-xs text-[var(--color-texto-mute)]">
                  Cuando un mensaje enviado con esta plantilla cambie de estado (entregado, leído, fallido), se manda un POST a esta URL.
                </p>
              </div>
            )}

            {tab === "etiquetas" && (
              <div className="space-y-3">
                <p className="text-sm text-[var(--color-texto-mute)]">
                  Etiquetas adicionales que se agregan al contacto al enviar esta plantilla (además de la etiqueta objetivo de la campaña).
                </p>
                <input
                  value={busquedaEtiqueta}
                  onChange={(e) => setBusquedaEtiqueta(e.target.value)}
                  placeholder="Buscar o crear una etiqueta…"
                  className={INPUT}
                />
                <div className="flex flex-wrap gap-2">
                  {etiquetasFiltradas.map((et) => {
                    const activa = etiquetasSeleccionadas.includes(et.nombre);
                    return (
                      <button
                        key={et.id}
                        type="button"
                        onClick={() =>
                          setEtiquetasSeleccionadas((prev) => (activa ? prev.filter((n) => n !== et.nombre) : [...prev, et.nombre]))
                        }
                        style={activa ? { backgroundColor: et.color, borderColor: et.color } : undefined}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          activa ? "text-white" : "border-[var(--color-borde)] text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]"
                        }`}
                      >
                        {et.nombre}
                      </button>
                    );
                  })}
                  {etiquetasCuenta.length === 0 && <p className="text-xs text-[var(--color-texto-mute)]">No hay etiquetas creadas todavía.</p>}
                </div>
                {busquedaEtiqueta.trim() && !hayEtiquetaExacta && (
                  <button
                    type="button"
                    disabled={creandoEtiqueta}
                    onClick={() => crearEtiqueta(busquedaEtiqueta.trim())}
                    className="text-xs font-medium text-[var(--color-marca)] hover:underline disabled:opacity-60"
                  >
                    {creandoEtiqueta ? "Creando…" : `+ Crear etiqueta "${busquedaEtiqueta.trim()}"`}
                  </button>
                )}
              </div>
            )}

            {tab === "etapa" && (
              <div className="space-y-2">
                <p className="text-sm text-[var(--color-texto-mute)]">
                  Si el contacto tiene un deal abierto en el Pipeline, se moverá a esta etapa al enviarle esta plantilla.
                </p>
                <select value={etapaDestinoId ?? ""} onChange={(e) => setEtapaDestinoId(e.target.value || null)} className={INPUT}>
                  <option value="">Ninguna (no mover de etapa)</option>
                  {etapas.map((et) => (
                    <option key={et.id} value={et.id}>
                      {et.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="border-t border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-6 py-4">
            {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={guardar}
                disabled={guardando}
                style={{ boxShadow: "var(--halo-accion)" }}
                className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {guardando ? "Guardando…" : "Guardar Plantilla"}
              </button>
              <button onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
                Cancelar
              </button>
            </div>
          </div>
        </div>

        <VistaPrevia
          headerTipo={headerTipo}
          headerTexto={headerTexto}
          headerMediaUrl={headerMediaUrl}
          body={body}
          footerTexto={footerTexto}
          respuestasRapidas={respuestasRapidas}
          ctas={ctas}
          usaCarrusel={usaCarrusel}
          tarjetas={tarjetas}
        />
      </div>

      {crearVariablePara !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto">
            <CampoVariableForm
              cuentaId={cuentaId}
              campo={null}
              siguienteOrden={variablesDisponibles.length}
              onGuardado={alGuardarVariableCreada}
              onCancelar={() => setCrearVariablePara(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function VistaPrevia({
  headerTipo,
  headerTexto,
  headerMediaUrl,
  body,
  footerTexto,
  respuestasRapidas,
  ctas,
  usaCarrusel,
  tarjetas,
}: {
  headerTipo: HeaderTipo;
  headerTexto: string;
  headerMediaUrl: string | null;
  body: string;
  footerTexto: string;
  respuestasRapidas: string[];
  ctas: { tipo: CtaTipo; text: string }[];
  usaCarrusel: boolean;
  tarjetas: Tarjeta[];
}) {
  return (
    <div className="hidden w-72 shrink-0 flex-col border-l border-[var(--color-borde)] bg-[#e5ddd5] p-4 dark:bg-[#0b141a] sm:flex">
      <p className="mb-3 text-xs font-medium text-[var(--color-texto-mute)]">Vista previa</p>
      <div className="rounded-lg bg-white p-3 text-sm text-neutral-900 shadow dark:bg-[#202c33] dark:text-neutral-100">
        {headerTipo === "texto" && headerTexto && <p className="mb-1 font-semibold">{headerTexto}</p>}
        {headerTipo !== "ninguno" && headerTipo !== "texto" && headerMediaUrl && (
          <div className="mb-2 flex h-28 items-center justify-center rounded bg-neutral-200 text-xs text-neutral-500 dark:bg-neutral-700">
            {headerTipo === "imagen" ? "🖼️" : headerTipo === "video" ? "🎬" : "📄"} {headerTipo}
          </div>
        )}
        {!usaCarrusel && <p className="whitespace-pre-wrap">{body || "Escribe un mensaje para ver la vista previa"}</p>}
        {footerTexto && <p className="mt-1 text-xs text-neutral-500">{footerTexto}</p>}
        {(respuestasRapidas.some((r) => r.trim()) || ctas.some((c) => c.text.trim())) && !usaCarrusel && (
          <div className="mt-2 space-y-1 border-t border-neutral-200 pt-2 dark:border-neutral-700">
            {respuestasRapidas.filter((r) => r.trim()).map((r, i) => (
              <div key={i} className="rounded border border-neutral-300 py-1 text-center text-xs text-[var(--color-marca)] dark:border-neutral-600">
                {r}
              </div>
            ))}
            {ctas.filter((c) => c.text.trim()).map((c, i) => (
              <div key={i} className="rounded border border-neutral-300 py-1 text-center text-xs text-[var(--color-marca)] dark:border-neutral-600">
                {c.text}
              </div>
            ))}
          </div>
        )}
        {usaCarrusel && (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {tarjetas.length === 0 && <p className="text-xs text-neutral-500">Agrega tarjetas para ver la vista previa</p>}
            {tarjetas.map((t, i) => (
              <div key={i} className="w-32 shrink-0 rounded border border-neutral-200 p-2 text-xs dark:border-neutral-700">
                <div className="mb-1 flex h-16 items-center justify-center rounded bg-neutral-200 dark:bg-neutral-700">
                  {t.media_tipo === "imagen" ? "🖼️" : "🎬"}
                </div>
                <p className="line-clamp-2">{t.body || "Mensaje…"}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
