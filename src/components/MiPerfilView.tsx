"use client";

import { useEffect, useState } from "react";

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

export function MiPerfilView({ nombre, email, rol }: { nombre: string | null; email: string | undefined; rol: string }) {
  const [tab, setTab] = useState<"info" | "google">("info");
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
            ...(integraciones?.es_profesional ? [["google", "Google Calendar"] as [string, string]] : []),
          ] as [string, string][]
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            onClick={() => setTab(valor as "info" | "google")}
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
