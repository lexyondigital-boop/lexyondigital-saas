import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PipelineView } from "@/components/PipelineView";

export default async function PipelinePage() {
  const { user, perfil, permisos } = await obtenerSesionApp();

  if (!permisos.view_pipeline) notFound();

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos} cuentaId={perfil.cuenta_id}>
      <PipelineView cuentaId={perfil.cuenta_id} perfilId={user.id} puedeGestionar={!!permisos.manage_deals} puedeConfigurar={!!permisos.manage_pipeline_config} />
    </AppShell>
  );
}
