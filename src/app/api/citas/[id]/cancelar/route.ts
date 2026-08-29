import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { eliminarEventoGoogle } from "@/lib/google-calendar";
import { registrarActividad } from "@/lib/auditoria";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  const { data: cita } = await supabase.from("citas_agendadas").select("*, profesionales(*)").eq("id", id).single();
  if (!cita) return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });

  if (cita.google_event_id && cita.profesionales) {
    await eliminarEventoGoogle({ profesional: cita.profesionales, eventId: cita.google_event_id });
  }

  const { error } = await supabase.from("citas_agendadas").update({ estado: "cancelada", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: perfil } = await supabase.from("perfiles").select("cuenta_id").eq("id", user.id).single();
  if (perfil) {
    await registrarActividad({
      cuentaId: perfil.cuenta_id,
      perfilId: user.id,
      accion: "cancel_appointment",
      recursoTipo: "cita",
      recursoId: id,
      request,
    });
  }

  return NextResponse.json({ ok: true });
}
