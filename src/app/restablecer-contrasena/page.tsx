"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

export default function RestablecerContrasenaPage() {
  const router = useRouter();
  const supabase = createClient();

  const [listo, setListo] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // El link del correo deja la sesión de recuperación establecida en el
    // cliente (vía el hash de la URL) antes de que este componente monte.
    supabase.auth.getSession().then(({ data }) => {
      setListo(!!data.session);
      if (!data.session) {
        setError("El link ya expiró o no es válido. Pide uno nuevo.");
      }
    });
  }, [supabase]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== password2) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setCargando(true);
    const { error } = await supabase.auth.updateUser({ password });
    setCargando(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6 shadow-sm">
          <div className="mb-4">
            <h1 className="text-lg font-semibold text-[var(--color-texto)]">Define tu contraseña</h1>
          </div>

          {error && !listo ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : (
            <form onSubmit={guardar} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nueva contraseña</span>
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Confirma la contraseña</span>
                <input
                  type="password"
                  required
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
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
                {cargando ? "Guardando…" : "Guardar y entrar"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
