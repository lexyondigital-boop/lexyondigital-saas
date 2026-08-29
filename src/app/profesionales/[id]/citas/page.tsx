import { notFound } from "next/navigation";
import { obtenerSesionApp } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { CitasProfesionalView } from "@/components/CitasProfesionalView";

export default async function CitasProfesionalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, perfil, permisos } = await obtenerSesionApp();
  if (!permisos.view_appointments) notFound();

  const supabase = await createClient();
  const { data: profesional } = await supabase.from("profesionales").select("id, nombre").eq("id", id).single();
  if (!profesional) notFound();

  return (
    <AppShell email={user.email} role={perfil.rol} permisos={permisos}>
      <CitasProfesionalView cuentaId={perfil.cuenta_id} profesionalId={profesional.id} nombreProfesional={profesional.nombre} />
    </AppShell>
  );
}
