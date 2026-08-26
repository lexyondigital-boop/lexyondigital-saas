import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { ContactosView } from "@/components/ContactosView";

export default async function ContactosPage() {
  const { user, perfil } = await obtenerSesionApp();

  return (
    <AppShell email={user.email} role={perfil.rol}>
      <ContactosView cuentaId={perfil.cuenta_id} />
    </AppShell>
  );
}
