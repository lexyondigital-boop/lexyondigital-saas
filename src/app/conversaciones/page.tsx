import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { ConversacionesView } from "@/components/ConversacionesView";

export default async function ConversacionesPage() {
  const { user, perfil, permisos } = await obtenerSesionApp();

  if (!permisos.view_conversations) notFound();

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos}>
      <ConversacionesView cuentaId={perfil.cuenta_id} />
    </AppShell>
  );
}
