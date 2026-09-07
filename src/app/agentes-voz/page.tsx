import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { AgentesVozView } from "@/components/AgentesVozView";

export default async function AgentesVozPage() {
  const { user, perfil, permisos } = await obtenerSesionApp();

  if (!permisos.view_agentes_voz) notFound();

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos} cuentaId={perfil.cuenta_id}>
      <AgentesVozView permisos={permisos} />
    </AppShell>
  );
}
