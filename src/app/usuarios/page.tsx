import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { UsuariosYPermisosView } from "@/components/UsuariosYPermisosView";

export default async function UsuariosPage() {
  const { user, perfil } = await obtenerSesionApp();

  if (perfil.rol === "agente") {
    notFound();
  }

  return (
    <AppShell email={user.email} role={perfil.rol}>
      <UsuariosYPermisosView cuentaId={perfil.cuenta_id} miPerfilId={user.id} />
    </AppShell>
  );
}
