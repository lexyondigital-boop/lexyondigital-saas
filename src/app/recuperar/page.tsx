"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

export default function RecuperarPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviarLink(e: FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/restablecer-contrasena`,
    });

    setCargando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEnviado(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6 shadow-sm">
          {enviado ? (
            <div className="space-y-2 text-center">
              <h1 className="text-lg font-semibold text-[var(--color-texto)]">Revisa tu correo</h1>
              <p className="text-sm text-[var(--color-texto-mute)]">
                Te mandamos un link a <strong className="text-[var(--color-texto)]">{email}</strong> para definir tu
                contraseña.
              </p>
            </div>
          ) : (
            <form onSubmit={enviarLink} className="space-y-4">
              <div>
                <h1 className="text-lg font-semibold text-[var(--color-texto)]">Recuperar contraseña</h1>
                <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
                  Te mandamos un link para definir una nueva.
                </p>
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
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={cargando}
                style={{ boxShadow: "var(--halo-accion)" }}
                className="w-full rounded-lg bg-[var(--color-accion)] px-4 py-2.5 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {cargando ? "Enviando…" : "Enviar link"}
              </button>
            </form>
          )}
          <Link
            href="/login"
            className="mt-4 block text-center text-sm text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]"
          >
            Volver a iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
