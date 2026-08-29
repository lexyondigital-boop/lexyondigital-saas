import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { crearEventoGoogle } from "@/lib/google-calendar";
import { registrarActividad } from "@/lib/auditoria";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase.from("perfiles").select("cuenta_id").eq("id", user.id).single();
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });

  const body = await request.json();
  const { contacto_id, profesional_ids, fecha, hora_inicio, hora_fin, tipo_cita, notas, creado_por } = body as {
    contacto_id: string;
    profesional_ids: string[];
    fecha: string;
    hora_inicio: string;
    hora_fin: string;
    tipo_cita?: string;
    notas?: string;
    creado_por?: "agente_ia" | "usuario_manual";
  };

  if (!contacto_id || !Array.isArray(profesional_ids) || profesional_ids.length === 0 || !fecha || !hora_inicio || !hora_fin) {
    return NextResponse.json({ error: "Faltan datos para agendar la cita" }, { status: 400 });
  }

  const { data: contacto } = await supabase.from("contactos").select("nombre, telefono").eq("id", contacto_id).single();
  if (!contacto) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  const citasCreadas = [];

  for (const profesionalId of profesional_ids) {
    const { data: profesional } = await supabase.from("profesionales").select("*").eq("id", profesionalId).single();
    if (!profesional) continue;

    const { data: choque } = await supabase
      .from("citas_agendadas")
      .select("id")
      .eq("profesional_id", profesionalId)
      .eq("fecha", fecha)
      .neq("estado", "cancelada")
      .lt("hora_inicio", hora_fin)
      .gt("hora_fin", hora_inicio)
      .maybeSingle();

    if (choque) {
      return NextResponse.json(
        { error: `${profesional.nombre} ya tiene una cita en ese horario. Verifica disponibilidad de nuevo.` },
        { status: 409 },
      );
    }

    const googleEventId = await crearEventoGoogle({
      profesional,
      resumen: `${tipo_cita || "Cita"} — ${contacto.nombre ?? contacto.telefono}`,
      descripcion: notas || "",
      inicio: new Date(`${fecha}T${hora_inicio}:00`),
      fin: new Date(`${fecha}T${hora_fin}:00`),
    });

    const { data: cita, error } = await supabase
      .from("citas_agendadas")
      .insert({
        cuenta_id: perfil.cuenta_id,
        contacto_id,
        profesional_id: profesionalId,
        fecha,
        hora_inicio,
        hora_fin,
        tipo_cita: tipo_cita ?? null,
        notas: notas ?? null,
        google_event_id: googleEventId,
        creado_por: creado_por === "agente_ia" ? "agente_ia" : "usuario_manual",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    citasCreadas.push(cita);
  }

  await registrarActividad({
    cuentaId: perfil.cuenta_id,
    perfilId: user.id,
    accion: "create_appointment",
    recursoTipo: "cita",
    detalles: { contacto_id, profesional_ids, fecha, hora_inicio },
    request,
  });

  return NextResponse.json({ citas: citasCreadas });
}
