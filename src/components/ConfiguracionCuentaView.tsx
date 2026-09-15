"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/Badge";

type CuentaWhatsapp = {
  numero_telefono: string | null;
  nombre_verificado: string | null;
  estado: "activo" | "inactivo" | "error";
  created_at: string;
};

type CuentaRetell = {
  modo: "master" | "propia";
  numero_saliente: string | null;
  intervalo_minimo_llamadas_minutos: number;
  activo: boolean;
  connected_by: string | null;
  created_at: string;
};

type CuentaCorreo = {
  proveedor: "google" | "smtp";
  remitente_nombre: string | null;
  remitente_correo: string | null;
  google_oauth_email: string | null;
  google_oauth_connected_at: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_usuario: string | null;
};

const INPUT =
  "w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]";

export function ConfiguracionCuentaView({ permisos }: { permisos: Record<string, boolean> }) {
  const supabase = createClient();
  const [whatsapp, setWhatsapp] = useState<CuentaWhatsapp | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("cuentas_whatsapp")
        .select("numero_telefono, nombre_verificado, estado, created_at")
        .maybeSingle();
      setWhatsapp(data);
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--color-texto)]">Configuración</h1>
      <p className="mt-1 text-sm text-[var(--color-texto-mute)]">Estado de las integraciones de tu cuenta.</p>

      <div className="mt-5 flex flex-wrap gap-5">
        <div className="max-w-md flex-1 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-texto)]">WhatsApp Business</h2>
          {cargando ? (
            <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
          ) : !whatsapp ? (
            <p className="text-sm text-[var(--color-texto-mute)]">Tu cuenta todavía no tiene WhatsApp conectado. Pide a Lexyondigital que lo configure.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-texto-mute)]">Estado</span>
                <Badge tono={whatsapp.estado === "activo" ? "en-vivo" : whatsapp.estado === "error" ? "aviso" : "mute"}>
                  {whatsapp.estado === "activo" ? "Activo" : whatsapp.estado === "error" ? "Error" : "Inactivo"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-texto-mute)]">Número</span>
                <span className="text-[var(--color-texto)]">{whatsapp.numero_telefono ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-texto-mute)]">Nombre verificado</span>
                <span className="text-[var(--color-texto)]">{whatsapp.nombre_verificado ?? "—"}</span>
              </div>
            </div>
          )}
          <p className="mt-4 text-xs text-[var(--color-texto-mute)]">
            Las credenciales de WhatsApp las administra Lexyondigital por seguridad. Si necesitas reconectar o cambiar el número, contáctanos.
          </p>
        </div>

        {permisos.manage_email && <SeccionCorreo />}
        {permisos.manage_integraciones && <SeccionIntegraciones />}
      </div>
    </div>
  );
}

// Contenedor de integraciones -- por ahora solo Retell, pero se deja como
// tarjeta propia para que sumar la siguiente integración sea agregar otra
// fila adentro, no otra tarjeta suelta en el layout general.
function SeccionIntegraciones() {
  return (
    <div className="max-w-md flex-1 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-texto)]">Integraciones</h2>
      <SeccionRetell />
      <div className="mt-6 border-t border-[var(--color-borde)] pt-6">
        <SeccionGoogleDrive />
      </div>
    </div>
  );
}

function SeccionRetell() {
  const [conectado, setConectado] = useState<CuentaRetell | null>(null);
  const [permiteMaster, setPermiteMaster] = useState(true);
  const [permitePropia, setPermitePropia] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [modo, setModo] = useState<"master" | "propia">("master");
  const [apiKey, setApiKey] = useState("");
  const [conectando, setConectando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    const res = await fetch("/api/integraciones/retell");
    const data = await res.json().catch(() => ({}));
    setConectado(data.conectado ?? null);
    setPermiteMaster(data.permiteMaster ?? true);
    setPermitePropia(data.permitePropia ?? true);
    setModo(data.permiteMaster === false && data.permitePropia !== false ? "propia" : "master");
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function conectar() {
    if (modo === "propia" && !apiKey.trim()) return;
    setConectando(true);
    setError(null);
    const res = await fetch("/api/integraciones/retell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modo, api_key: modo === "propia" ? apiKey.trim() : undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setConectando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo conectar con Retell");
      return;
    }
    setApiKey("");
    cargar();
  }

  async function desconectar() {
    if (!confirm("¿Desconectar Retell AI de esta cuenta?")) return;
    setError(null);
    const res = await fetch("/api/integraciones/retell", { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo desconectar Retell");
      return;
    }
    cargar();
  }

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium text-[var(--color-texto)]">Retell AI</h3>
      <p className="mb-3 text-xs text-[var(--color-texto-mute)]">Agente de voz por IA para llamadas telefónicas.</p>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {cargando ? (
        <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
      ) : conectado ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-texto-mute)]">Estado</span>
            <Badge tono="en-vivo">Conectado</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-texto-mute)]">Plan</span>
            <span className="text-[var(--color-texto)]">
              {conectado.modo === "master" ? "Incluido (lexyondigital)" : "Propio (mi API de Retell)"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-texto-mute)]">Desde</span>
            <span className="text-[var(--color-texto)]">{new Date(conectado.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
          {conectado.modo === "propia" ? (
            <SelectorNumeroSaliente numeroActual={conectado.numero_saliente} onGuardado={cargar} />
          ) : (
            <div className="border-t border-[var(--color-borde)] pt-2">
              <p className="text-xs text-[var(--color-texto-mute)]">
                El número de cada agente lo asigna tu administrador por plantilla, en Agentes de Voz.
              </p>
            </div>
          )}
          <SelectorIntervaloLlamadas intervaloActual={conectado.intervalo_minimo_llamadas_minutos} onGuardado={cargar} />
          <button onClick={desconectar} className="mt-2 text-sm font-medium text-red-500 hover:underline">
            Desconectar
          </button>
        </div>
      ) : !permiteMaster && !permitePropia ? (
        <p className="text-sm text-[var(--color-texto-mute)]">
          Esta cuenta todavía no tiene ningún modo de Retell habilitado. Contacta a lexyondigital.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {permiteMaster && permitePropia && (
            <div className="flex flex-col gap-2 text-sm text-[var(--color-texto)]">
              <label className="flex items-center gap-2">
                <input type="radio" name="retell_modo" checked={modo === "master"} onChange={() => setModo("master")} />
                Incluido con lexyondigital
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="retell_modo" checked={modo === "propia"} onChange={() => setModo("propia")} />
                Mi propia cuenta de Retell
              </label>
            </div>
          )}
          {modo === "propia" && (
            <>
              <p className="text-xs text-[var(--color-texto-mute)]">
                ¿No tienes cuenta de Retell?{" "}
                <a
                  href="https://www.retellai.com/es"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[var(--color-marca)] hover:underline"
                >
                  Inicia sesión o regístrate ↗
                </a>
              </p>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API key de Retell"
                className={INPUT}
              />
            </>
          )}
          <button
            onClick={conectar}
            disabled={conectando || (modo === "propia" && !apiKey.trim())}
            className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80 disabled:opacity-50"
          >
            {conectando ? "Conectando…" : "Conectar"}
          </button>
        </div>
      )}
    </div>
  );
}

// Los números disponibles salen de la propia cuenta de Retell conectada
// (GET /v2/list-phone-numbers) en vez de que el admin lo copie/pegue a
// mano -- así se evita un typo que tire silenciosamente cada llamada.
function SelectorNumeroSaliente({ numeroActual, onGuardado }: { numeroActual: string | null; onGuardado: () => void }) {
  const [numeros, setNumeros] = useState<{ phone_number: string; phone_number_pretty: string | null; nickname: string | null }[]>([]);
  const [seleccionado, setSeleccionado] = useState(numeroActual ?? "");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/integraciones/retell/numeros")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        setNumeros(data.numeros ?? []);
      })
      .finally(() => setCargando(false));
  }, []);

  async function guardar() {
    if (!seleccionado) return;
    setGuardando(true);
    setError(null);
    const res = await fetch("/api/integraciones/retell", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numero_saliente: seleccionado }),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar el número saliente");
      return;
    }
    onGuardado();
  }

  return (
    <div className="border-t border-[var(--color-borde)] pt-2">
      <div className="flex items-center justify-between">
        <span className="text-[var(--color-texto-mute)]">Número saliente</span>
        <span className="text-[var(--color-texto)]">{numeroActual ?? "Sin elegir"}</span>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {cargando ? (
        <p className="mt-2 text-xs text-[var(--color-texto-mute)]">Buscando números en Retell…</p>
      ) : numeros.length > 0 ? (
        <div className="mt-2 flex gap-2">
          <select value={seleccionado} onChange={(e) => setSeleccionado(e.target.value)} className={INPUT}>
            <option value="">Elegir número…</option>
            {numeros.map((n) => (
              <option key={n.phone_number} value={n.phone_number}>
                {n.phone_number_pretty ?? n.phone_number}
                {n.nickname ? ` (${n.nickname})` : ""}
              </option>
            ))}
          </select>
          <button
            onClick={guardar}
            disabled={guardando || !seleccionado || seleccionado === numeroActual}
            className="shrink-0 rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-xs font-medium text-[var(--color-texto)] hover:opacity-80 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      ) : (
        !error && <p className="mt-2 text-xs text-[var(--color-texto-mute)]">Esa cuenta de Retell todavía no tiene números.</p>
      )}
    </div>
  );
}

// Cada cuánto se puede volver a llamar al mismo contacto -- evita que las
// llamadas se sientan como spam si alguien insiste en marcar seguido.
function SelectorIntervaloLlamadas({ intervaloActual, onGuardado }: { intervaloActual: number; onGuardado: () => void }) {
  const [seleccionado, setSeleccionado] = useState(intervaloActual);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(valor: number) {
    setSeleccionado(valor);
    setGuardando(true);
    setError(null);
    const res = await fetch("/api/integraciones/retell", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intervalo_minimo_llamadas_minutos: valor }),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar el intervalo");
      return;
    }
    onGuardado();
  }

  return (
    <div className="border-t border-[var(--color-borde)] pt-2">
      <div className="flex items-center justify-between">
        <span className="text-[var(--color-texto-mute)]">Intervalo mínimo entre llamadas</span>
        <select value={seleccionado} disabled={guardando} onChange={(e) => guardar(Number(e.target.value))} className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-2 py-1 text-sm text-[var(--color-texto)]">
          <option value={2}>2 minutos</option>
          <option value={5}>5 minutos</option>
          <option value={10}>10 minutos</option>
        </select>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}

type ProfesionalDrive = { id: string; nombre: string; email: string | null; google_oauth_email: string | null };
type ConexionDrive = { id: string; google_email: string; profesional_id: string | null; created_at: string };

function SeccionGoogleDrive() {
  const [profesionales, setProfesionales] = useState<ProfesionalDrive[]>([]);
  const [conexiones, setConexiones] = useState<ConexionDrive[]>([]);
  const [configurado, setConfigurado] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // `cargando` ya arranca en true, así que no hace falta volver a activarlo
  // acá -- hacerlo sería un setState síncrono dentro del efecto. Al recargar
  // tras desconectar, la lista se actualiza sin parpadear a "Cargando…".
  async function cargar() {
    const res = await fetch("/api/integraciones/google-drive");
    const data = await res.json().catch(() => ({}));
    setProfesionales(data.profesionales ?? []);
    setConexiones(data.conexiones ?? []);
    setConfigurado(data.configurado ?? false);
    setCargando(false);

    // El resultado del consentimiento de Google vuelve como query param. Se
    // lee acá y no en el efecto porque ahí sería un setState síncrono.
    const params = new URLSearchParams(window.location.search);
    if (!params.has("sheets")) return;
    if (params.get("sheets") === "conectado") setMensaje("Google Drive conectado correctamente.");
    if (params.get("sheets") === "error") setError(params.get("mensaje") ?? "No se pudo conectar Google Drive");
    window.history.replaceState({}, "", window.location.pathname);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function conectar(profesionalId: string | null) {
    setConectando(true);
    setError(null);
    const res = await fetch("/api/auth/google-sheets/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profesional_id: profesionalId, volver_a: "/configuracion" }),
    });
    const data = await res.json().catch(() => ({}));
    setConectando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo iniciar la conexión con Google");
      return;
    }
    window.location.assign(data.url);
  }

  async function desconectar(id: string, correo: string) {
    if (!confirm(`¿Desconectar ${correo}? Las hojas ya creadas se quedan en su Drive, pero la plataforma pierde el acceso.`)) return;
    setError(null);
    const res = await fetch("/api/auth/google-sheets/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo desconectar");
      return;
    }
    cargar();
  }

  const conectadosPorProfesional = new Set(conexiones.map((c) => c.profesional_id).filter(Boolean));
  const sinConectar = profesionales.filter((p) => !conectadosPorProfesional.has(p.id));

  function nombreDeProfesional(id: string | null) {
    if (!id) return null;
    return profesionales.find((p) => p.id === id)?.nombre ?? null;
  }

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium text-[var(--color-texto)]">Google Sheets</h3>
      <p className="mb-3 text-xs text-[var(--color-texto-mute)]">
        Para importar y exportar contactos y destinatarios de campaña como hojas de cálculo. Las hojas se crean en el Drive de
        la cuenta conectada.
      </p>

      {mensaje && <p className="mb-3 text-sm text-[var(--color-en-vivo)]">{mensaje}</p>}
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {!configurado ? (
        <p className="text-sm text-[var(--color-texto-mute)]">
          Google todavía no está configurado en la plataforma. Pide a Lexyondigital que lo habilite.
        </p>
      ) : cargando ? (
        <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
      ) : (
        <div className="space-y-4">
          {conexiones.length > 0 && (
            <ul className="space-y-2">
              {conexiones.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-[var(--color-texto)]">{c.google_email}</span>
                    {nombreDeProfesional(c.profesional_id) && (
                      <span className="block text-xs text-[var(--color-texto-mute)]">{nombreDeProfesional(c.profesional_id)}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Badge tono="en-vivo">Conectado</Badge>
                    <button
                      onClick={() => desconectar(c.id, c.google_email)}
                      className="text-sm font-medium text-red-500 hover:underline"
                    >
                      Desconectar
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {sinConectar.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-[var(--color-texto-mute)]">
                Profesionales de esta cuenta sin Drive conectado. Cada uno tiene que autorizar el acceso una vez, aunque ya
                tenga Google Calendar: ese permiso es solo de agenda y no alcanza para Drive.
              </p>
              <ul className="space-y-1.5">
                {sinConectar.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-[var(--color-texto)]">{p.nombre}</span>
                    <button
                      onClick={() => conectar(p.id)}
                      disabled={conectando}
                      className="shrink-0 text-sm font-medium text-[var(--color-marca)] hover:underline disabled:opacity-50"
                    >
                      Conectar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={() => conectar(null)}
            disabled={conectando}
            className="text-sm font-medium text-[var(--color-marca)] hover:underline disabled:opacity-50"
          >
            {conectando ? "Abriendo Google…" : "Conectar otra cuenta de Google"}
          </button>
        </div>
      )}
    </div>
  );
}

function SeccionCorreo() {
  const [conectado, setConectado] = useState<CuentaCorreo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [conectandoGoogle, setConectandoGoogle] = useState(false);
  const [mostrarSmtp, setMostrarSmtp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    const res = await fetch("/api/cuentas-correo");
    const data = await res.json().catch(() => ({}));
    setConectado(data.conectado ?? null);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    const params = new URLSearchParams(window.location.search);
    if (params.get("correo") === "conectado") setMensaje("Correo conectado correctamente.");
    if (params.get("correo") === "error") setError(params.get("mensaje") ?? "No se pudo conectar el correo");
    if (params.has("correo")) window.history.replaceState({}, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function conectarGoogle() {
    setConectandoGoogle(true);
    setError(null);
    const res = await fetch("/api/auth/google-email/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volver_a: "/configuracion" }),
    });
    const data = await res.json();
    setConectandoGoogle(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo iniciar la conexión con Google");
      return;
    }
    window.location.href = data.url;
  }

  async function desconectar() {
    if (!confirm("¿Desconectar el correo de esta cuenta?")) return;
    setError(null);
    const ruta = conectado?.proveedor === "google" ? "/api/auth/google-email/disconnect" : "/api/cuentas-correo/smtp";
    const res = await fetch(ruta, { method: conectado?.proveedor === "google" ? "POST" : "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo desconectar el correo");
      return;
    }
    cargar();
  }

  return (
    <div className="max-w-md flex-1 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-texto)]">Correo saliente</h2>
      <p className="mb-3 text-xs text-[var(--color-texto-mute)]">
        Se usa para confirmar citas por correo y para campañas de remarketing.
      </p>

      {mensaje && <p className="mb-3 text-sm text-[var(--color-en-vivo)]">{mensaje}</p>}
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {cargando ? (
        <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
      ) : conectado ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-texto-mute)]">Proveedor</span>
            <Badge tono="en-vivo">{conectado.proveedor === "google" ? "Gmail" : "SMTP"}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-texto-mute)]">Remitente</span>
            <span className="text-[var(--color-texto)]">
              {conectado.proveedor === "google" ? conectado.google_oauth_email : `${conectado.smtp_usuario}@${conectado.smtp_host}`}
            </span>
          </div>
          <button onClick={desconectar} className="mt-2 text-sm font-medium text-red-500 hover:underline">
            Desconectar
          </button>
        </div>
      ) : mostrarSmtp ? (
        <FormularioSmtp onGuardado={cargar} onCancelar={() => setMostrarSmtp(false)} />
      ) : (
        <div className="flex flex-col gap-2">
          <button
            onClick={conectarGoogle}
            disabled={conectandoGoogle}
            className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80 disabled:opacity-50"
          >
            {conectandoGoogle ? "Redirigiendo…" : "🔗 Conectar con Google"}
          </button>
          <button
            onClick={() => setMostrarSmtp(true)}
            className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80"
          >
            Configurar SMTP de mi correo corporativo
          </button>
        </div>
      )}
    </div>
  );
}

function FormularioSmtp({ onGuardado, onCancelar }: { onGuardado: () => void; onCancelar: () => void }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState(587);
  const [seguridad, setSeguridad] = useState<"ssl" | "tls" | "ninguna">("tls");
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [remitenteNombre, setRemitenteNombre] = useState("");
  const [remitenteCorreo, setRemitenteCorreo] = useState("");
  const [probando, setProbando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [probado, setProbado] = useState(false);

  const datos = { host, port, seguridad, usuario, password, remitente_correo: remitenteCorreo };

  async function probar() {
    setProbando(true);
    setError(null);
    const res = await fetch("/api/cuentas-correo/smtp/probar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const data = await res.json().catch(() => ({}));
    setProbando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo conectar con ese servidor SMTP");
      setProbado(false);
      return;
    }
    setProbado(true);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const res = await fetch("/api/cuentas-correo/smtp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...datos, remitente_nombre: remitenteNombre }),
    });
    const data = await res.json().catch(() => ({}));
    setGuardando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar el SMTP");
      return;
    }
    onGuardado();
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--color-texto)]">Servidor (host)</span>
        <input value={host} onChange={(e) => { setHost(e.target.value); setProbado(false); }} placeholder="smtp.miempresa.com" className={INPUT} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-texto)]">Puerto</span>
          <input type="number" value={port} onChange={(e) => { setPort(Number(e.target.value)); setProbado(false); }} className={INPUT} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-texto)]">Seguridad</span>
          <select value={seguridad} onChange={(e) => { setSeguridad(e.target.value as typeof seguridad); setProbado(false); }} className={INPUT}>
            <option value="tls">TLS (STARTTLS)</option>
            <option value="ssl">SSL</option>
            <option value="ninguna">Ninguna</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--color-texto)]">Usuario</span>
        <input value={usuario} onChange={(e) => { setUsuario(e.target.value); setProbado(false); }} className={INPUT} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--color-texto)]">Contraseña</span>
        <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setProbado(false); }} className={INPUT} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--color-texto)]">Nombre del remitente (opcional)</span>
        <input value={remitenteNombre} onChange={(e) => setRemitenteNombre(e.target.value)} className={INPUT} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--color-texto)]">Correo remitente</span>
        <input value={remitenteCorreo} onChange={(e) => { setRemitenteCorreo(e.target.value); setProbado(false); }} className={INPUT} />
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {probado && <p className="text-sm text-[var(--color-en-vivo)]">Conexión exitosa — revisa el correo de prueba.</p>}

      <div className="flex gap-2">
        {!probado ? (
          <button
            onClick={probar}
            disabled={probando || !host || !usuario || !password || !remitenteCorreo}
            className="rounded-lg border border-[var(--color-borde)] px-3 py-2 text-sm font-medium text-[var(--color-texto)] disabled:opacity-50"
          >
            {probando ? "Probando…" : "Probar conexión"}
          </button>
        ) : (
          <button
            onClick={guardar}
            disabled={guardando}
            style={{ boxShadow: "var(--halo-accion)" }}
            className="rounded-lg bg-[var(--color-accion)] px-3 py-2 text-sm font-semibold text-[var(--color-accion-fg)] disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        )}
        <button onClick={onCancelar} className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
          Cancelar
        </button>
      </div>
    </div>
  );
}
