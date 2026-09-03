import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { ContactosView } from "@/components/ContactosView";

export default async function ContactosPage() {
  const { user, perfil, permisos } = await obtenerSesionApp();

  if (!permisos.view_contacts) notFound();

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos} cuentaId={perfil.cuenta_id}>
      <ContactosView cuentaId={perfil.cuenta_id} puedeExportar={!!permisos.export_contacts} />
    </AppShell>
  );
}
