"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

type CuentaDisponible = { cuenta_id: string; nombre: string; codigo: string | null; rol: string; es_casa: boolean };

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cuentas, setCuentas] = useState<CuentaDisponible[] | null>(null);
  const [cambiando, setCambiando] = useState(false);

  async function entrar() {
    fetch("/api/auditoria/login", { method: "POST" }).catch(() => {});
    router.replace("/");
    router.refresh();
  }

  async function iniciarSesion(e: FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setCargando(false);
      setError(error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos" : error.message);
      return;
    }

    // Si el correo tiene acceso a más de una cuenta (ver membresias_cuenta),
    // se le pregunta a cuál entrar en vez de mandarlo directo -- la
    // inmensa mayoría de logins solo tiene una y no ve este paso.
    const res = await fetch("/api/auth/cuentas-disponibles");
    const data = await res.json().catch(() => ({}));
    setCargando(false);

    if (res.ok && Array.isArray(data.cuentas) && data.cuentas.length > 1) {
      setCuentas(data.cuentas);
      return;
    }

    entrar();
  }

  async function elegirCuenta(cuentaId: string) {
    setCambiando(true);
    setError(null);
    const res = await fetch("/api/auth/cambiar-cuenta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuenta_id: cuentaId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setCambiando(false);
      setError(data.error ?? "No se pudo entrar a esa cuenta");
      return;
    }
    await supabase.auth.refreshSession();
    entrar();
  }

  if (cuentas) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Logo />
          </div>
          <div className="space-y-3 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6 shadow-sm">
            <div>
              <h1 className="text-lg font-semibold text-[var(--color-texto)]">¿A qué cuenta quieres entrar?</h1>
              <p className="mt-1 text-sm text-[var(--color-texto-mute)]">Tu correo tiene acceso a más de una cuenta.</p>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="space-y-2">
              {cuentas.map((c) => (
                <button
                  key={c.cuenta_id}
                  onClick={() => elegirCuenta(c.cuenta_id)}
                  disabled={cambiando}
                  className="flex w-full items-center justify-between rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-4 py-3 text-left text-sm font-medium text-[var(--color-texto)] transition-opacity hover:opacity-80 disabled:opacity-60"
                >
                  <span>
                    {c.nombre}
                    {c.codigo ? ` · ${c.codigo}` : ""}
                  </span>
                  <span className="text-xs text-[var(--color-texto-mute)]">{c.es_casa ? "Tu cuenta" : "Acceso adicional"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <form
          onSubmit={iniciarSesion}
          className="space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6 shadow-sm"
        >
          <div>
            <h1 className="text-lg font-semibold text-[var(--color-texto)]">Inicia sesión</h1>
            <p className="mt-1 text-sm text-[var(--color-texto-mute)]">Entra con tu correo y contraseña.</p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Correo</span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Contraseña</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
            />
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={cargando}
            style={{ boxShadow: "var(--halo-accion)" }}
            className="w-full rounded-lg bg-[var(--color-accion)] px-4 py-2.5 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {cargando ? "Entrando…" : "Entrar"}
          </button>

          <Link
            href="/recuperar"
            className="block text-center text-sm text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]"
          >
            ¿Olvidaste tu contraseña o es tu primer ingreso?
          </Link>
        </form>
      </div>
    </div>
  );
}
