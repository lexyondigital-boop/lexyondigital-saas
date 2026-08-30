import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { MiPerfilView } from "@/components/MiPerfilView";

export default async function MiPerfilPage() {
  const { user, perfil, permisos } = await obtenerSesionApp();

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos} cuentaId={perfil.cuenta_id}>
      <MiPerfilView nombre={perfil.nombre} email={user.email} rol={perfil.rol} />
    </AppShell>
  );
}
