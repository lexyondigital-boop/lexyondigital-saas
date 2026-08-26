import { redirect } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { CuentaMasterDashboard } from "@/components/CuentaMasterDashboard";

export default async function HomePage() {
  const { user, perfil } = await obtenerSesionApp();

  if (perfil.rol !== "super_admin") {
    redirect("/dashboard");
  }

  return (
    <AppShell email={user.email} role={perfil.rol}>
      <CuentaMasterDashboard />
    </AppShell>
  );
}
