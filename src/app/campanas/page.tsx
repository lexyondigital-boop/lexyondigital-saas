import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { CampanasView } from "@/components/CampanasView";

export default async function CampanasPage() {
  const { user, perfil, permisos } = await obtenerSesionApp();

  if (!permisos.view_campaigns) notFound();

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos}>
      <CampanasView cuentaId={perfil.cuenta_id} />
    </AppShell>
  );
}
