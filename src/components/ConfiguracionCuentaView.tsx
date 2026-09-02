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
      </div>
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
