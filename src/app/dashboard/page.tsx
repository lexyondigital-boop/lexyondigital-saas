import { obtenerSesionApp } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function DashboardPage() {
  const { user, perfil, permisos } = await obtenerSesionApp();
  const supabase = await createClient();

  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);

  const [{ count: contactos }, { count: conversacionesAbiertas }, { count: mensajesHoy }, { count: campanasActivas }] =
    await Promise.all([
      supabase.from("contactos").select("id", { count: "exact", head: true }),
      supabase.from("conversaciones").select("id", { count: "exact", head: true }).eq("status", "abierta"),
      supabase.from("mensajes").select("id", { count: "exact", head: true }).gte("created_at", inicioHoy.toISOString()),
      supabase.from("campanas").select("id", { count: "exact", head: true }).eq("status", "enviando"),
    ]);

  const tarjetas = [
    { etiqueta: "Contactos", valor: contactos ?? 0 },
    { etiqueta: "Conversaciones abiertas", valor: conversacionesAbiertas ?? 0 },
    { etiqueta: "Mensajes hoy", valor: mensajesHoy ?? 0 },
    { etiqueta: "Campañas enviando", valor: campanasActivas ?? 0 },
  ];

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos}>
      <h1 className="text-xl font-bold text-[var(--color-texto)]">
        Bienvenido{perfil.nombre ? `, ${perfil.nombre}` : ""}
      </h1>
      <p className="mt-1 text-sm text-[var(--color-texto-mute)]">Resumen general de tu cuenta.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tarjetas.map((t) => (
          <div
            key={t.etiqueta}
            className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5"
          >
            <p className="text-sm text-[var(--color-texto-mute)]">{t.etiqueta}</p>
            <p className="mt-2 text-3xl font-bold text-[var(--color-texto)]">{t.valor}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
