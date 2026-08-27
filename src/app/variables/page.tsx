import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { VariablesView } from "@/components/VariablesView";

export default async function VariablesPage() {
  const { user, perfil } = await obtenerSesionApp();

  return (
    <AppShell email={user.email} role={perfil.rol}>
      <VariablesView cuentaId={perfil.cuenta_id} />
    </AppShell>
  );
}
