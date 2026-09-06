import { redirect } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PlantillasVozMaestrasView } from "@/components/PlantillasVozMaestrasView";

export default async function PlantillasVozMaestrasPage() {
  const { user, perfil } = await obtenerSesionApp();

  if (perfil.rol !== "super_admin") {
    redirect("/dashboard");
  }

  return (
    <AppShell email={user.email} role={perfil.rol}>
      <PlantillasVozMaestrasView />
    </AppShell>
  );
}
