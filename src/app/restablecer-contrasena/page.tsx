"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { CampoTelefono } from "@/components/CampoTelefono";

export default function RestablecerContrasenaPage() {
  const router = useRouter();
  const supabase = createClient();

  const [listo, setListo] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // El link del correo deja la sesión de recuperación establecida en el
    // cliente (vía cookies, puestas por /auth/confirm) antes de que este
    // componente monte.
    supabase.auth.getSession().then(async ({ data }) => {
      setListo(!!data.session);
      if (!data.session) {
        setError("El link ya expiró o no es válido. Pide uno nuevo.");
        return;
      }
      const { data: perfil } = await supabase.from("perfiles").select("telefono").eq("id", data.session.user.id).single();
      if (perfil?.telefono) setTelefono(perfil.telefono);
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
    if (!telefono.trim()) {
      setError("El teléfono es obligatorio");
      return;
    }

    setCargando(true);

    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) {
      setCargando(false);
      setError(passwordError.message);
      return;
    }

    const res = await fetch("/api/mi-perfil", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telefono: telefono.trim() }),
    });
    setCargando(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Tu contraseña quedó guardada, pero no pudimos guardar el teléfono. Actualízalo después en Mi perfil.");
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
              <CampoTelefono required value={telefono} onChange={setTelefono} />
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
