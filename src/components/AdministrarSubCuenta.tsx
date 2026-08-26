"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Badge } from "@/components/Badge";

type Cuenta = {
  id: string;
  nombre: string;
  codigo: string | null;
  slug: string | null;
  giro: string | null;
  plan: string;
  activa: boolean;
  created_at: string;
};

type Whatsapp = {
  id: string;
  phone_number_id: string;
  waba_id: string | null;
  numero_telefono: string | null;
  nombre_verificado: string | null;
  estado: "activo" | "inactivo" | "error";
} | null;

type Usuario = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  rol: "admin" | "agente" | "super_admin";
  activo: boolean;
  created_at: string;
  email: string | null;
};

type Datos = { cuenta: Cuenta; whatsapp: Whatsapp; usuarios: Usuario[] };

type Tab = "general" | "whatsapp" | "usuarios";

export function AdministrarSubCuenta({ id }: { id: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState<Tab>("general");
  const [accionando, setAccionando] = useState(false);

  async function cargar() {
    setCargando(true);
    const res = await fetch(`/api/cuentas/${id}`);
    if (res.ok) {
      setDatos(await res.json());
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function alternarPausa() {
    if (!datos) return;
    setAccionando(true);
    await fetch(`/api/cuentas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activa: !datos.cuenta.activa }),
    });
    await cargar();
    setAccionando(false);
  }

  async function eliminarCuenta() {
    if (!datos) return;
    if (!confirm(`¿Eliminar definitivamente "${datos.cuenta.nombre}"? Esto borra sus usuarios, conexión de WhatsApp y todos sus datos. No se puede deshacer.`)) {
      return;
    }
    setAccionando(true);
    const res = await fetch(`/api/cuentas/${id}`, { method: "DELETE" });
    if (res.ok) {
      window.location.href = "/";
    } else {
      setAccionando(false);
      alert("No se pudo eliminar la sub-cuenta.");
    }
  }

  if (cargando) {
    return <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>;
  }

  if (!datos) {
    return <p className="text-sm text-[var(--color-texto-mute)]">No se encontró la sub-cuenta.</p>;
  }

  const { cuenta } = datos;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-texto)]">{cuenta.nombre}</h1>
          <p className="mt-1 text-xs text-[var(--color-texto-mute)]">
            {cuenta.codigo} · {cuenta.slug}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tono={cuenta.activa ? "en-vivo" : "mute"}>{cuenta.activa ? "Activa" : "Inactiva"}</Badge>
          <button
            onClick={alternarPausa}
            disabled={accionando}
            className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-tarjeta)] px-3 py-1.5 text-sm font-medium text-[var(--color-texto)] transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {cuenta.activa ? "Pausar" : "Reanudar"}
          </button>
          <button
            onClick={eliminarCuenta}
            disabled={accionando}
            className="rounded-lg px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ color: "#ef4444", background: "color-mix(in srgb, #ef4444 14%, transparent)" }}
          >
            Eliminar sub-cuenta
          </button>
          <Link href="/" className="text-sm text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
            Volver
          </Link>
        </div>
      </div>

      <div className="mb-6 flex gap-5 border-b border-[var(--color-borde)]">
        {([
          ["general", "General"],
          ["whatsapp", "WhatsApp"],
          ["usuarios", "Usuarios"],
        ] as [Tab, string][]).map(([valor, etiqueta]) => (
          <button
            key={valor}
            onClick={() => setTab(valor)}
            className="border-b-2 pb-2.5 text-sm font-medium transition-colors"
            style={{
              borderColor: tab === valor ? "var(--color-marca)" : "transparent",
              color: tab === valor ? "var(--color-texto)" : "var(--color-texto-mute)",
            }}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {tab === "general" && <PestanaGeneral id={id} cuenta={cuenta} onCambio={cargar} />}
      {tab === "whatsapp" && <PestanaWhatsapp id={id} whatsapp={datos.whatsapp} onCambio={cargar} />}
      {tab === "usuarios" && <PestanaUsuarios id={id} usuarios={datos.usuarios} onCambio={cargar} />}
    </div>
  );
}

function PestanaGeneral({ id, cuenta, onCambio }: { id: string; cuenta: Cuenta; onCambio: () => void }) {
  const [giro, setGiro] = useState(cuenta.giro ?? "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    await fetch(`/api/cuentas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giro }),
    });
    setGuardando(false);
    onCambio();
  }

  return (
    <div className="max-w-xl space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
      <div>
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Giro de negocio</span>
        <div className="flex gap-2">
          <input
            value={giro}
            onChange={(e) => setGiro(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
          <button
            onClick={guardar}
            disabled={guardando}
            style={{ boxShadow: "var(--halo-accion)" }}
            className="shrink-0 rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
        <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
          Texto libre, puramente descriptivo — no dispara ninguna copia de configuración.
        </span>
      </div>

      <div className="border-t border-[var(--color-borde)] pt-4">
        <span className="block text-sm font-medium text-[var(--color-texto)]">Creada</span>
        <span className="mt-1 block text-sm text-[var(--color-texto-mute)]">
          {new Date(cuenta.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      </div>
    </div>
  );
}

function PestanaWhatsapp({ id, whatsapp, onCambio }: { id: string; whatsapp: Whatsapp; onCambio: () => void }) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [probando, setProbando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function probarConexion() {
    setProbando(true);
    setMensaje(null);
    const res = await fetch(`/api/cuentas/${id}/whatsapp/probar`, { method: "POST" });
    const data = await res.json();
    setProbando(false);
    setMensaje(res.ok ? `Conexión OK — ${data.nombreVerificado ?? data.numero}` : `Error: ${data.error}`);
    onCambio();
  }

  async function desconectar() {
    if (!confirm("¿Desconectar el WhatsApp de esta sub-cuenta?")) return;
    await fetch(`/api/cuentas/${id}/whatsapp`, { method: "DELETE" });
    onCambio();
  }

  if (mostrarForm || !whatsapp) {
    return (
      <ConectarWhatsappForm
        id={id}
        onCancelar={whatsapp ? () => setMostrarForm(false) : undefined}
        onConectado={() => {
          setMostrarForm(false);
          onCambio();
        }}
      />
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-texto)]">Número conectado</h3>
          <Badge tono={whatsapp.estado === "activo" ? "en-vivo" : whatsapp.estado === "error" ? "aviso" : "mute"}>
            {whatsapp.estado === "activo" ? "Activo" : whatsapp.estado === "error" ? "Error" : "Inactivo"}
          </Badge>
        </div>

        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--color-texto-mute)]">Phone Number ID</dt>
            <dd className="text-[var(--color-texto)]">{whatsapp.phone_number_id}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-texto-mute)]">WABA ID</dt>
            <dd className="text-[var(--color-texto)]">{whatsapp.waba_id ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-texto-mute)]">Número telefónico</dt>
            <dd className="text-[var(--color-texto)]">{whatsapp.numero_telefono ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-texto-mute)]">Nombre verificado</dt>
            <dd className="text-[var(--color-texto)]">{whatsapp.nombre_verificado ?? "—"}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--color-borde)] pt-4">
          <button
            onClick={probarConexion}
            disabled={probando}
            className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-1.5 text-sm font-medium text-[var(--color-texto)] transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {probando ? "Probando…" : "Probar conexión"}
          </button>
          <button
            onClick={() => setMostrarForm(true)}
            className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-1.5 text-sm font-medium text-[var(--color-texto)] transition-opacity hover:opacity-80"
          >
            Reconectar a otro número
          </button>
          <button
            onClick={desconectar}
            className="rounded-lg px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ color: "#ef4444", background: "color-mix(in srgb, #ef4444 14%, transparent)" }}
          >
            Desconectar
          </button>
        </div>

        {mensaje && <p className="mt-3 text-xs text-[var(--color-texto-mute)]">{mensaje}</p>}
      </div>
    </div>
  );
}

function ConectarWhatsappForm({
  id,
  onConectado,
  onCancelar,
}: {
  id: string;
  onConectado: () => void;
  onCancelar?: () => void;
}) {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function conectar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const res = await fetch(`/api/cuentas/${id}/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number_id: phoneNumberId, waba_id: wabaId, access_token: accessToken }),
    });
    const data = await res.json();
    setEnviando(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo conectar");
      return;
    }

    onConectado();
  }

  return (
    <form
      onSubmit={conectar}
      className="max-w-xl space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6"
    >
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-texto)]">Conectar WhatsApp</h3>
        <p className="mt-0.5 text-xs text-[var(--color-texto-mute)]">
          Datos del número desde Meta for Developers (API Setup).
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Phone Number ID</span>
        <input
          required
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">WABA ID (opcional)</span>
        <input
          value={wabaId}
          onChange={(e) => setWabaId(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Access token</span>
        <input
          required
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={enviando}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {enviando ? "Conectando…" : "Conectar"}
        </button>
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function PestanaUsuarios({ id, usuarios, onCambio }: { id: string; usuarios: Usuario[]; onCambio: () => void }) {
  const [mostrarForm, setMostrarForm] = useState(false);

  async function cambiarRol(usuarioId: string, rol: string) {
    await fetch(`/api/cuentas/${id}/usuarios/${usuarioId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rol }),
    });
    onCambio();
  }

  async function reenviarCorreo(usuarioId: string) {
    await fetch(`/api/cuentas/${id}/usuarios/${usuarioId}/reenviar`, { method: "POST" });
    alert("Correo reenviado.");
  }

  async function eliminarUsuario(usuarioId: string, nombre: string | null) {
    if (!confirm(`¿Eliminar a ${nombre ?? "este usuario"}? Pierde acceso de inmediato.`)) return;
    await fetch(`/api/cuentas/${id}/usuarios/${usuarioId}`, { method: "DELETE" });
    onCambio();
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--color-texto-mute)]">Usuarios con acceso a esta sub-cuenta.</p>
        <button
          onClick={() => setMostrarForm((v) => !v)}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
        >
          {mostrarForm ? "Cancelar" : "Nuevo usuario"}
        </button>
      </div>

      {mostrarForm && (
        <NuevoUsuarioForm
          id={id}
          onCreado={() => {
            setMostrarForm(false);
            onCambio();
          }}
        />
      )}

      <div className="space-y-3">
        {usuarios.length === 0 && (
          <p className="text-sm text-[var(--color-texto-mute)]">Todavía no hay usuarios.</p>
        )}
        {usuarios.map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-4"
          >
            <div>
              <p className="text-sm font-medium text-[var(--color-texto)]">{u.nombre ?? "Sin nombre"}</p>
              <p className="text-xs text-[var(--color-texto-mute)]">{u.email}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {u.rol === "super_admin" ? (
                <Badge tono="marca">Super admin</Badge>
              ) : (
                <select
                  value={u.rol}
                  onChange={(e) => cambiarRol(u.id, e.target.value)}
                  className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-2.5 py-1.5 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
                >
                  <option value="admin">Administrador</option>
                  <option value="agente">Agente</option>
                </select>
              )}
              <Badge tono={u.activo ? "en-vivo" : "mute"}>{u.activo ? "Activo" : "Inactivo"}</Badge>
              <button
                onClick={() => reenviarCorreo(u.id)}
                className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-1.5 text-sm font-medium text-[var(--color-texto)] transition-opacity hover:opacity-80"
              >
                Reenviar correo
              </button>
              {u.rol !== "super_admin" && (
                <button
                  onClick={() => eliminarUsuario(u.id, u.nombre)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ color: "#ef4444", background: "color-mix(in srgb, #ef4444 14%, transparent)" }}
                >
                  Eliminar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NuevoUsuarioForm({ id, onCreado }: { id: string; onCreado: () => void }) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("admin");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const res = await fetch(`/api/cuentas/${id}/usuarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, telefono, email, rol }),
    });
    const data = await res.json();
    setEnviando(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo crear el usuario");
      return;
    }

    onCreado();
  }

  return (
    <form
      onSubmit={crear}
      className="mb-4 space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nombre</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Teléfono</span>
          <input
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Correo</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Rol</span>
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          >
            <option value="admin">Administrador</option>
            <option value="agente">Agente</option>
          </select>
        </label>
      </div>

      <span className="block text-xs text-[var(--color-texto-mute)]">
        Le llegará un correo con un link para definir su propia contraseña.
      </span>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={enviando}
        style={{ boxShadow: "var(--halo-accion)" }}
        className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {enviando ? "Creando…" : "Crear usuario"}
      </button>
    </form>
  );
}
