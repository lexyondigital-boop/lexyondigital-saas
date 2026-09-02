import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerValoresContactoPorClave } from "@/lib/variables-contacto";
import { enviarCorreo, reemplazarVariablesEmail } from "@/lib/email-envio";

type AdminClient = ReturnType<typeof createAdminClient>;

type Cita = { id: string; fecha: string; hora_inicio: string; hora_fin: string; tipo_cita: string | null; confirmacion_email_enviado?: boolean };
type Contacto = { id: string; correo_electronico: string | null; nombre_completo: string | null; nombre: string | null };
type Profesional = { nombre: string; logo_url?: string | null; color_marca?: string | null; redes_sociales?: Record<string, string> | null };
type TipoCorreoCita = "confirmacion_cita" | "reagendamiento_cita" | "cancelacion_cita";

// Manda el correo asociado a una cita (confirmación, reagendamiento o
// cancelación), si la cuenta tiene correo conectado, tiene una plantilla
// activa de ese tipo, y el contacto tiene correo capturado -- cualquiera
// de esas tres condiciones faltando, se omite en silencio (es un extra,
// nunca bloquea la acción sobre la cita en sí).
async function enviarCorreoDeCita(
  admin: AdminClient,
  cuentaId: string,
  tipo: TipoCorreoCita,
  cita: Cita,
  contacto: Contacto,
  profesional: Profesional,
): Promise<void> {
  if (!contacto.correo_electronico) return;

  const { data: plantilla } = await admin
    .from("plantillas_email")
    .select("asunto, cuerpo_html")
    .eq("cuenta_id", cuentaId)
    .eq("tipo", tipo)
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
    profesional_logo: profesional.logo_url ?? "",
    profesional_color: profesional.color_marca ?? "",
    profesional_facebook: profesional.redes_sociales?.facebook ?? "",
    profesional_instagram: profesional.redes_sociales?.instagram ?? "",
    profesional_tiktok: profesional.redes_sociales?.tiktok ?? "",
  };

  const resultado = await enviarCorreo({
    cuentaId,
    contactoId: contacto.id,
    citaId: cita.id,
    destinatario: contacto.correo_electronico,
    asunto: reemplazarVariablesEmail(plantilla.asunto, valores),
    cuerpoHtml: reemplazarVariablesEmail(plantilla.cuerpo_html, valores),
  });

  if (resultado.ok && tipo === "confirmacion_cita") {
    // Idempotencia solo aplica a la confirmación inicial (para que
    // reagendar_cita, que reutiliza esta función con otro tipo, no la
    // dispare de nuevo) -- reagendamiento y cancelación son cada uno un
    // evento de una sola vez por acción, no necesitan ese guardado.
    await admin
      .from("citas_agendadas")
      .update({ confirmacion_email_enviado: true, confirmacion_email_enviado_at: new Date().toISOString() })
      .eq("id", cita.id);
  }
}

// Idempotente vía citas_agendadas.confirmacion_email_enviado, para no
// mandar dos veces la confirmación de la misma cita.
export async function enviarConfirmacionCitaPorCorreo(
  admin: AdminClient,
  cuentaId: string,
  cita: Cita,
  contacto: Contacto,
  profesional: Profesional,
): Promise<void> {
  if (cita.confirmacion_email_enviado) return;
  await enviarCorreoDeCita(admin, cuentaId, "confirmacion_cita", cita, contacto, profesional);
}

export async function enviarReagendamientoCitaPorCorreo(
  admin: AdminClient,
  cuentaId: string,
  cita: Cita,
  contacto: Contacto,
  profesional: Profesional,
): Promise<void> {
  await enviarCorreoDeCita(admin, cuentaId, "reagendamiento_cita", cita, contacto, profesional);
}

export async function enviarCancelacionCitaPorCorreo(
  admin: AdminClient,
  cuentaId: string,
  cita: Cita,
  contacto: Contacto,
  profesional: Profesional,
): Promise<void> {
  await enviarCorreoDeCita(admin, cuentaId, "cancelacion_cita", cita, contacto, profesional);
}
