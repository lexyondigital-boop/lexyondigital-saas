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
  usuarios: number;
  whatsapp_conectado: boolean;
};

export function CuentaMasterDashboard() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);

  async function cargar() {
    setCargando(true);
    const res = await fetch("/api/cuentas");
    const data = await res.json();
    setCuentas(data.cuentas ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-texto)]">Sub-cuentas</h1>
          <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
            {cuentas.length} sub-cuenta{cuentas.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          onClick={() => setMostrarForm((v) => !v)}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
        >
          {mostrarForm ? "Cancelar" : "Nueva sub-cuenta"}
        </button>
      </div>

      {mostrarForm && (
        <NuevaSubCuentaForm
          onCreada={() => {
            setMostrarForm(false);
            cargar();
          }}
        />
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)]">
        {cargando ? (
          <p className="p-6 text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : cuentas.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-texto-mute)]">Todavía no hay sub-cuentas.</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-borde)] text-xs uppercase tracking-wide text-[var(--color-texto-mute)]">
                <th className="px-5 py-3 font-medium">Sub-cuenta</th>
                <th className="px-5 py-3 font-medium">Giro</th>
                <th className="px-5 py-3 font-medium">WhatsApp</th>
                <th className="px-5 py-3 font-medium">Usuarios</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Creada</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => (
                <tr key={c.id} className="border-b border-[var(--color-borde)] last:border-0">
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-[var(--color-texto)]">{c.nombre}</div>
                    <div className="text-xs text-[var(--color-texto-mute)]">
                      {c.codigo} · {c.slug}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    {c.giro ? <Badge tono="ia">{c.giro}</Badge> : <span className="text-[var(--color-texto-mute)]">—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    {c.whatsapp_conectado ? (
                      <Badge tono="en-vivo">Conectado</Badge>
                    ) : (
                      <Badge tono="mute">Sin conectar</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-texto)]">{c.usuarios}</td>
                  <td className="px-5 py-3.5">
                    <Badge tono={c.activa ? "en-vivo" : "mute"}>{c.activa ? "Activa" : "Inactiva"}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-texto-mute)]">
                    {new Date(c.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href={`/cuentas/${c.id}`}
                      className="text-sm font-medium text-[var(--color-marca)] hover:underline"
                    >
                      Administrar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function NuevaSubCuentaForm({ onCreada }: { onCreada: () => void }) {
  const [nombreCuenta, setNombreCuenta] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditadoAMano, setSlugEditadoAMano] = useState(false);
  const [giro, setGiro] = useState("");
  const [nombreAdmin, setNombreAdmin] = useState("");
  const [telefonoAdmin, setTelefonoAdmin] = useState("");
  const [emailAdmin, setEmailAdmin] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function actualizarNombre(valor: string) {
    setNombreCuenta(valor);
    if (!slugEditadoAMano) {
      setSlug(
        valor
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, ""),
      );
    }
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const res = await fetch("/api/cuentas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre_cuenta: nombreCuenta,
        slug,
        giro,
        nombre_admin: nombreAdmin,
        telefono_admin: telefonoAdmin,
        email_admin: emailAdmin,
      }),
    });

    const data = await res.json();
    setEnviando(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo crear la sub-cuenta");
      return;
    }

    onCreada();
  }

  return (
    <form
      onSubmit={crear}
      className="mb-2 space-y-5 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6"
    >
      <div>
        <h2 className="text-base font-semibold text-[var(--color-texto)]">Nueva sub-cuenta</h2>
        <p className="mt-0.5 text-sm text-[var(--color-texto-mute)]">
          Crea el negocio y su primer usuario administrador.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nombre de la sub-cuenta</span>
          <input
            required
            value={nombreCuenta}
            onChange={(e) => actualizarNombre(e.target.value)}
            placeholder="Ej. Grupo Financiero XYZ"
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Slug</span>
          <input
            value={slug}
            onChange={(e) => {
              setSlugEditadoAMano(true);
              setSlug(e.target.value);
            }}
            placeholder="se genera del nombre"
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
          <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
            Identificador corto, se genera automáticamente del nombre.
          </span>
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Giro de negocio</span>
        <input
          value={giro}
          onChange={(e) => setGiro(e.target.value)}
          placeholder="Ej. Cobranza, Ventas B2B, Soporte técnico"
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
        <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
          Texto libre, puramente descriptivo. No copia ninguna configuración — la cuenta arranca en blanco.
        </span>
      </label>

      <div className="rounded-xl border border-[var(--color-borde)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-texto)]">Primer usuario administrador</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nombre</span>
            <input
              value={nombreAdmin}
              onChange={(e) => setNombreAdmin(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Teléfono</span>
            <input
              type="tel"
              value={telefonoAdmin}
              onChange={(e) => setTelefonoAdmin(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Correo</span>
            <input
              type="email"
              required
              value={emailAdmin}
              onChange={(e) => setEmailAdmin(e.target.value)}
              placeholder="admin@cliente.com"
              className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
            />
            <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
              Le llegará un correo con un link para definir su propia contraseña.
            </span>
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={enviando}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {enviando ? "Creando…" : "Crear sub-cuenta"}
        </button>
      </div>
    </form>
  );
}
