import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { ConfiguracionPlataformaView } from "@/components/ConfiguracionPlataformaView";
import { ConfiguracionCuentaView } from "@/components/ConfiguracionCuentaView";

export default async function ConfiguracionPage() {
  const { user, perfil, permisos } = await obtenerSesionApp();

  if (perfil.rol === "super_admin") {
    return (
      <AppShell email={user.email} role={perfil.rol} permisos={permisos} cuentaId={perfil.cuenta_id}>
        <ConfiguracionPlataformaView />
      </AppShell>
    );
  }

  if (!permisos.access_configuration) notFound();

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos} cuentaId={perfil.cuenta_id}>
      <ConfiguracionCuentaView permisos={permisos} />
    </AppShell>
  );
}
