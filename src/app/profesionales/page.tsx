import { Suspense } from "react";
import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { ProfesionalesView } from "@/components/ProfesionalesView";

export default async function ProfesionalesPage() {
  const { user, perfil, permisos } = await obtenerSesionApp();

  if (!permisos.view_professionals) notFound();

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos} cuentaId={perfil.cuenta_id}>
      <Suspense fallback={null}>
        <ProfesionalesView />
      </Suspense>
    </AppShell>
  );
}
