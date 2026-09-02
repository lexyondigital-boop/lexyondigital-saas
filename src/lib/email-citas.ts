import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerValoresContactoPorClave } from "@/lib/variables-contacto";
import { enviarCorreo, reemplazarVariablesEmail } from "@/lib/email-envio";

type AdminClient = ReturnType<typeof createAdminClient>;

type Cita = { id: string; fecha: string; hora_inicio: string; hora_fin: string; tipo_cita: string | null; confirmacion_email_enviado: boolean };
type Contacto = { id: string; correo_electronico: string | null; nombre_completo: string | null; nombre: string | null };
type Profesional = { nombre: string };

// Manda el correo de confirmación de una cita, si la cuenta tiene correo
// conectado, tiene una plantilla activa de tipo confirmacion_cita, y el
// contacto tiene correo capturado -- cualquiera de esas tres condiciones
// faltando, se omite en silencio (es un extra, no bloquea el agendado).
// Idempotente vía citas_agendadas.confirmacion_email_enviado, para que
// reagendar_cita no mande un segundo correo de la misma cita.
export async function enviarConfirmacionCitaPorCorreo(
  admin: AdminClient,
  cuentaId: string,
  cita: Cita,
  contacto: Contacto,
  profesional: Profesional,
): Promise<void> {
  if (cita.confirmacion_email_enviado) return;
  if (!contacto.correo_electronico) return;

  const { data: plantilla } = await admin
    .from("plantillas_email")
    .select("asunto, cuerpo_html")
    .eq("cuenta_id", cuentaId)
    .eq("tipo", "confirmacion_cita")
    .eq("activa", true)
    .limit(1)
    .maybeSingle();

  if (!plantilla) return;

  const valoresContacto = await obtenerValoresContactoPorClave(admin, cuentaId, contacto.id, ["nombre_completo", "correo_electronico"]);
  const valores: Record<string, string> = {
    ...valoresContacto,
    nombre: contacto.nombre_completo ?? contacto.nombre ?? "",
    cita_fecha: cita.fecha,
    cita_hora_inicio: cita.hora_inicio,
    cita_hora_fin: cita.hora_fin,
    tipo_cita: cita.tipo_cita ?? "",
    profesional_nombre: profesional.nombre,
  };

  const resultado = await enviarCorreo({
    cuentaId,
    contactoId: contacto.id,
    citaId: cita.id,
    destinatario: contacto.correo_electronico,
    asunto: reemplazarVariablesEmail(plantilla.asunto, valores),
    cuerpoHtml: reemplazarVariablesEmail(plantilla.cuerpo_html, valores),
  });

  if (resultado.ok) {
    await admin
      .from("citas_agendadas")
      .update({ confirmacion_email_enviado: true, confirmacion_email_enviado_at: new Date().toISOString() })
      .eq("id", cita.id);
  }
}
