import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { CalendariosView } from "@/components/CalendariosView";

export default async function CalendariosPage() {
  const { user, perfil, permisos } = await obtenerSesionApp();

  if (!permisos.view_appointments) notFound();

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos}>
      <CalendariosView cuentaId={perfil.cuenta_id} puedeGestionar={!!permisos.manage_appointments} />
    </AppShell>
  );
}
