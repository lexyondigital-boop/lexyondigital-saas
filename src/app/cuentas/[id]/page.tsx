import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { AdministrarSubCuenta } from "@/components/AdministrarSubCuenta";

export default async function AdministrarCuentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, perfil } = await obtenerSesionApp();

  if (perfil.rol !== "super_admin") {
    notFound();
  }

  return (
    <AppShell email={user.email} role={perfil.rol}>
      <AdministrarSubCuenta id={id} />
    </AppShell>
  );
}
