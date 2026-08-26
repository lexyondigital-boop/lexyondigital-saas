import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PlantillasView } from "@/components/PlantillasView";

export default async function PlantillasPage() {
  const { user, perfil } = await obtenerSesionApp();

  return (
    <AppShell email={user.email} role={perfil.rol}>
      <PlantillasView cuentaId={perfil.cuenta_id} />
    </AppShell>
  );
}
