import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { ContactosView } from "@/components/ContactosView";

export default async function ContactosPage() {
  const { user, perfil, permisos } = await obtenerSesionApp();

  if (!permisos.view_contacts) notFound();

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos}>
      <ContactosView cuentaId={perfil.cuenta_id} />
    </AppShell>
  );
}
