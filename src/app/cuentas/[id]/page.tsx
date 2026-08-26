import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { AdministrarSubCuenta } from "@/components/AdministrarSubCuenta";

export default async function AdministrarCuentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol, activo")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || !perfil.activo) {
    redirect("/sin-acceso");
  }

  if (perfil.rol !== "super_admin") {
    notFound();
  }

  return (
    <AppShell email={user.email}>
      <AdministrarSubCuenta id={id} />
    </AppShell>
  );
}
