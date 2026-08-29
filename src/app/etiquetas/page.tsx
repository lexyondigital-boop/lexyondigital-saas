import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { EtiquetasView } from "@/components/EtiquetasView";

export default async function EtiquetasPage() {
  const { user, perfil, permisos } = await obtenerSesionApp();

  if (!permisos.view_tags) notFound();

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos}>
      <EtiquetasView cuentaId={perfil.cuenta_id} />
    </AppShell>
  );
}
