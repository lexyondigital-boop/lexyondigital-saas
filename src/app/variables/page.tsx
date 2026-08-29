import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { VariablesView } from "@/components/VariablesView";

export default async function VariablesPage() {
  const { user, perfil, permisos } = await obtenerSesionApp();

  if (!permisos.view_variables) notFound();

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos}>
      <VariablesView cuentaId={perfil.cuenta_id} />
    </AppShell>
  );
}
