"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CampoTelefono } from "@/components/CampoTelefono";

type Integraciones = {
  es_profesional: boolean;
  profesional_id?: string;
  disponible: boolean;
  google_calendar?: {
    connected: boolean;
    email?: string;
    calendar_name?: string;
    connected_at?: string;
    last_refresh?: string;
  };
};

type ProfesionalPropio = {
  especialidad: string;
  telefono: string | null;
  biografia: string | null;
  color_agenda: string;
  horario_inicio: string;
  horario_fin: string;
  dias_disponibles: string[];
  duracion_cita_minutos: number;
  logo_url: string | null;
  color_marca: string | null;
  redes_sociales: { facebook?: string; instagram?: string; tiktok?: string };
};

const DIAS: { valor: string; etiqueta: string }[] = [
  { valor: "lunes", etiqueta: "L" },
  { valor: "martes", etiqueta: "M" },
  { valor: "miercoles", etiqueta: "Mi" },
  { valor: "jueves", etiqueta: "J" },
  { valor: "viernes", etiqueta: "V" },
  { valor: "sabado", etiqueta: "S" },
  { valor: "domingo", etiqueta: "D" },
];

export function MiPerfilView({ nombre, email, rol }: { nombre: string | null; email: string | undefined; rol: string }) {
  const [tab, setTab] = useState<"info" | "disponibilidad" | "google">("info");
  const [integraciones, setIntegraciones] = useState<Integraciones | null>(null);
  const [conectando, setConectando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    const res = await fetch("/api/auth/me/integraciones");
    if (res.ok) setIntegraciones(await res.json());
  }

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "conectado") cargar();
  }, []);

  async function conectar() {
    if (!integraciones?.profesional_id) return;
    setConectando(true);
    setError(null);
    const res = await fetch("/api/auth/google-calendar/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profesional_id: integraciones.profesional_id, volver_a: "/mi-perfil" }),
    });
    const data = await res.json();
    setConectando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo iniciar la conexión con Google");
      return;
    }
    window.location.href = data.url;
  }

  async function desconectar() {
    if (!integraciones?.profesional_id) return;
    if (!confirm("¿Desconectar tu Google Calendar?")) return;
    await fetch("/api/auth/google-calendar/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profesional_id: integraciones.profesional_id }),
    });
    cargar();
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--color-texto)]">Mi perfil</h1>
      <p className="mt-1 text-sm text-[var(--color-texto-mute)]">Tu información y tus integraciones personales.</p>

      <div className="mb-6 mt-5 flex gap-5 border-b border-[var(--color-borde)]">
        {(
          [
            ["info", "Información personal"],
            ...(integraciones?.es_profesional ? [["disponibilidad", "Disponibilidad"] as [string, string]] : []),
            ...(integraciones?.es_profesional ? [["google", "Google Calendar"] as [string, string]] : []),
          ] as [string, string][]
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            onClick={() => setTab(valor as "info" | "disponibilidad" | "google")}
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

      {tab === "info" && (
        <div className="max-w-md space-y-3 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
          <div>
            <span className="block text-xs font-medium text-[var(--color-texto-mute)]">Nombre</span>
            <span className="text-sm text-[var(--color-texto)]">{nombre ?? "—"}</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-[var(--color-texto-mute)]">Correo</span>
            <span className="text-sm text-[var(--color-texto)]">{email ?? "—"}</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-[var(--color-texto-mute)]">Rol</span>
            <span className="text-sm text-[var(--color-texto)]">
              {rol === "super_admin" ? "Super admin" : rol === "admin" ? "Administrador" : "Agente"}
              {integraciones?.es_profesional ? " · Profesionista" : ""}
            </span>
          </div>
        </div>
      )}

      {tab === "disponibilidad" && integraciones?.es_profesional && <PestanaDisponibilidad />}

      {tab === "google" && integraciones?.es_profesional && (
        <div className="max-w-md rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
          {!integraciones.disponible ? (
            <p className="text-sm text-[var(--color-texto-mute)]">Google Calendar todavía no está configurado en la plataforma.</p>
          ) : integraciones.google_calendar?.connected ? (
            <div className="text-sm text-[var(--color-texto)]">
              <p>✅ Google Calendar conectado</p>
              <p className="mt-1 text-[var(--color-texto-mute)]">📧 {integraciones.google_calendar.email}</p>
              <p className="text-[var(--color-texto-mute)]">📅 {integraciones.google_calendar.calendar_name}</p>
              {integraciones.google_calendar.connected_at && (
                <p className="text-[var(--color-texto-mute)]">
                  Conectado desde: {new Date(integraciones.google_calendar.connected_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              )}
              <div className="mt-3 flex gap-3">
                <button onClick={conectar} className="text-sm font-medium text-[var(--color-marca)] hover:underline">
                  Cambiar cuenta
                </button>
                <button onClick={desconectar} className="text-sm font-medium text-red-500 hover:underline">
                  Desconectar
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-[var(--color-texto)]">Permite que tus citas se guarden automáticamente en tu Google Calendar.</p>
              <button
                onClick={conectar}
                disabled={conectando}
                style={{ boxShadow: "var(--halo-accion)" }}
                className="mt-3 rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {conectando ? "Redirigiendo…" : "Conectar con Google"}
              </button>
            </div>
          )}
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}

function PestanaDisponibilidad() {
  const [datos, setDatos] = useState<ProfesionalPropio | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/mi-profesional");
      if (res.ok) {
        const data = await res.json();
        setDatos(data.profesional);
      }
    })();
  }, []);

  if (!datos) {
    return <div className="max-w-2xl rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6 text-sm text-[var(--color-texto-mute)]">Cargando…</div>;
  }

  function alternarDia(dia: string) {
    setDatos((prev) =>
      prev ? { ...prev, dias_disponibles: prev.dias_disponibles.includes(dia) ? prev.dias_disponibles.filter((d) => d !== dia) : [...prev.dias_disponibles, dia] } : prev,
    );
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!datos) return;
    setEnviando(true);
    setError(null);
    setGuardado(false);

    const res = await fetch("/api/mi-profesional", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    setEnviando(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar");
      return;
    }
    setGuardado(true);
  }

  return (
    <form onSubmit={guardar} className="max-w-2xl space-y-5 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Especialidad</span>
          <input value={datos.especialidad} onChange={(e) => setDatos({ ...datos, especialidad: e.target.value })} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]" />
        </label>
        <CampoTelefono value={datos.telefono ?? ""} onChange={(v) => setDatos({ ...datos, telefono: v })} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Horario inicio</span>
          <input type="time" value={datos.horario_inicio} onChange={(e) => setDatos({ ...datos, horario_inicio: e.target.value })} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Horario fin</span>
          <input type="time" value={datos.horario_fin} onChange={(e) => setDatos({ ...datos, horario_fin: e.target.value })} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Duración de cita</span>
          <select value={datos.duracion_cita_minutos} onChange={(e) => setDatos({ ...datos, duracion_cita_minutos: Number(e.target.value) })} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]">
            {[15, 30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m} minutos
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Color en la agenda</span>
          <input type="color" value={datos.color_agenda} onChange={(e) => setDatos({ ...datos, color_agenda: e.target.value })} className="h-9 w-16 rounded border border-[var(--color-borde)] bg-transparent" />
        </label>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Días disponibles</span>
        <div className="flex flex-wrap gap-2">
          {DIAS.map((d) => (
            <button
              key={d.valor}
              type="button"
              onClick={() => alternarDia(d.valor)}
              className="h-8 w-9 rounded-lg text-xs font-semibold"
              style={
                datos.dias_disponibles.includes(d.valor)
                  ? { background: "var(--color-marca)", color: "var(--color-accion-fg)" }
                  : { background: "var(--color-bg-elevada)", color: "var(--color-texto-mute)", border: "1px solid var(--color-borde)" }
              }
            >
              {d.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Biografía (opcional)</span>
        <textarea value={datos.biografia ?? ""} onChange={(e) => setDatos({ ...datos, biografia: e.target.value })} rows={2} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]" />
      </label>

      <div className="space-y-3 border-t border-[var(--color-borde)] pt-4">
        <h3 className="text-sm font-semibold text-[var(--color-texto)]">Marca personal</h3>
        <p className="text-xs text-[var(--color-texto-mute)]">Se usa en los correos de tus citas (confirmación, reagendamiento, cancelación) si la plantilla las incluye.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Logo (URL)</span>
            <input
              value={datos.logo_url ?? ""}
              onChange={(e) => setDatos({ ...datos, logo_url: e.target.value })}
              placeholder="https://..."
              className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Color de marca</span>
            <input type="color" value={datos.color_marca ?? "#6b2fa0"} onChange={(e) => setDatos({ ...datos, color_marca: e.target.value })} className="h-9 w-16 rounded border border-[var(--color-borde)] bg-transparent" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Facebook (URL)</span>
            <input
              value={datos.redes_sociales.facebook ?? ""}
              onChange={(e) => setDatos({ ...datos, redes_sociales: { ...datos.redes_sociales, facebook: e.target.value } })}
              placeholder="https://facebook.com/..."
              className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Instagram (URL)</span>
            <input
              value={datos.redes_sociales.instagram ?? ""}
              onChange={(e) => setDatos({ ...datos, redes_sociales: { ...datos.redes_sociales, instagram: e.target.value } })}
              placeholder="https://instagram.com/..."
              className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">TikTok (URL)</span>
            <input
              value={datos.redes_sociales.tiktok ?? ""}
              onChange={(e) => setDatos({ ...datos, redes_sociales: { ...datos.redes_sociales, tiktok: e.target.value } })}
              placeholder="https://tiktok.com/@..."
              className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
            />
          </label>
        </div>
      </div>

      {guardado && <p className="text-sm text-[var(--color-marca)]">Guardado.</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={enviando}
        style={{ boxShadow: "var(--halo-accion)" }}
        className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {enviando ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
