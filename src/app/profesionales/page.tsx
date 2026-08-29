import { Suspense } from "react";
import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { ProfesionalesView } from "@/components/ProfesionalesView";

export default async function ProfesionalesPage() {
  const { user, perfil } = await obtenerSesionApp();

  if (perfil.rol === "agente") {
    notFound();
  }

  return (
    <AppShell email={user.email} role={perfil.rol}>
      <Suspense fallback={null}>
        <ProfesionalesView />
      </Suspense>
    </AppShell>
  );
}
