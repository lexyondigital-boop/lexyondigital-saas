import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { AgenteIaView } from "@/components/AgenteIaView";

export default async function AgenteIaPage() {
  const { user, perfil } = await obtenerSesionApp();

  return (
    <AppShell email={user.email} role={perfil.rol}>
      <AgenteIaView cuentaId={perfil.cuenta_id} />
    </AppShell>
  );
}
