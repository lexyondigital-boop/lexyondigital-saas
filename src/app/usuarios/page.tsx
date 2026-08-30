import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { UsuariosYPermisosView } from "@/components/UsuariosYPermisosView";

export default async function UsuariosPage() {
  const { user, perfil, permisos } = await obtenerSesionApp();

  if (!permisos.manage_users) notFound();

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos} cuentaId={perfil.cuenta_id}>
      <UsuariosYPermisosView cuentaId={perfil.cuenta_id} miPerfilId={user.id} />
    </AppShell>
  );
}
