import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { ConversacionesView } from "@/components/ConversacionesView";

export default async function ConversacionesPage() {
  const { user, perfil } = await obtenerSesionApp();

  return (
    <AppShell email={user.email} role={perfil.rol}>
      <ConversacionesView cuentaId={perfil.cuenta_id} />
    </AppShell>
  );
}
