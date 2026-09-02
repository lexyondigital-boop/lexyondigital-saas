import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PlantillasView } from "@/components/PlantillasView";

export default async function PlantillasPage() {
  const { user, perfil, permisos } = await obtenerSesionApp();

  if (!permisos.view_templates) notFound();

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos} cuentaId={perfil.cuenta_id}>
      <PlantillasView cuentaId={perfil.cuenta_id} permisos={permisos} />
    </AppShell>
  );
}
