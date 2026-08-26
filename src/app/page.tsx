import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { CuentaMasterDashboard } from "@/components/CuentaMasterDashboard";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol, nombre, activo")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || !perfil.activo) {
    redirect("/sin-acceso");
  }

  return (
    <AppShell email={user.email}>
      {perfil.rol === "super_admin" ? (
        <CuentaMasterDashboard />
      ) : (
        <div className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-8 text-center">
          <h1 className="text-lg font-semibold text-[var(--color-texto)]">
            Bienvenido{perfil.nombre ? `, ${perfil.nombre}` : ""}
          </h1>
          <p className="mt-2 text-sm text-[var(--color-texto-mute)]">
            El panel de tu cuenta todavía está en construcción.
          </p>
        </div>
      )}
    </AppShell>
  );
}
