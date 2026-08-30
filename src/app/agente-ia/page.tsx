import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { AgenteIaView } from "@/components/AgenteIaView";

export default async function AgenteIaPage() {
  const { user, perfil, permisos } = await obtenerSesionApp();

  if (!permisos.access_agent_ia) notFound();

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos} cuentaId={perfil.cuenta_id}>
      <AgenteIaView cuentaId={perfil.cuenta_id} />
    </AppShell>
  );
}
