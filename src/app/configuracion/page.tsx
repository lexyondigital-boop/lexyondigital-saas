import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { ConfiguracionPlataformaView } from "@/components/ConfiguracionPlataformaView";

export default async function ConfiguracionPage() {
  const { user, perfil } = await obtenerSesionApp();

  if (perfil.rol !== "super_admin") {
    notFound();
  }

  return (
    <AppShell email={user.email} role={perfil.rol}>
      <ConfiguracionPlataformaView />
    </AppShell>
  );
}
