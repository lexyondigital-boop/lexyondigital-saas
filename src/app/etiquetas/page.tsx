import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { EtiquetasView } from "@/components/EtiquetasView";

export default async function EtiquetasPage() {
  const { user, perfil } = await obtenerSesionApp();

  return (
    <AppShell email={user.email} role={perfil.rol}>
      <EtiquetasView cuentaId={perfil.cuenta_id} />
    </AppShell>
  );
}
