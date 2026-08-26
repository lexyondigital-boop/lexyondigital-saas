import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { CampanasView } from "@/components/CampanasView";

export default async function CampanasPage() {
  const { user, perfil } = await obtenerSesionApp();

  return (
    <AppShell email={user.email} role={perfil.rol}>
      <CampanasView cuentaId={perfil.cuenta_id} />
    </AppShell>
  );
}
