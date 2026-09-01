import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type CredencialesWhatsapp = {
  cuentaWhatsappId: string;
  phoneNumberId: string;
  wabaId: string | null;
  accessToken: string;
};

// El join cuentas_whatsapp + whatsapp_credenciales ya está copiado varias
// veces en el proyecto (webhook, cron de campañas, envío de mensajes) pero
// ninguno selecciona waba_id -- se necesita para crear plantillas en Meta
// (POST /{waba_id}/message_templates). Se agrega como helper nuevo solo para
// el código de plantillas, sin tocar los usos existentes.
export async function obtenerCredencialesWhatsapp(
  admin: AdminClient,
  cuentaId: string,
): Promise<CredencialesWhatsapp | null> {
  const { data: cuentaWhatsapp } = await admin
    .from("cuentas_whatsapp")
    .select("id, phone_number_id, waba_id")
    .eq("cuenta_id", cuentaId)
    .eq("estado", "activo")
    .maybeSingle();

  if (!cuentaWhatsapp) return null;

  const { data: credencial } = await admin
    .from("whatsapp_credenciales")
    .select("access_token")
    .eq("cuenta_whatsapp_id", cuentaWhatsapp.id)
    .maybeSingle();

  if (!credencial) return null;

  return {
    cuentaWhatsappId: cuentaWhatsapp.id,
    phoneNumberId: cuentaWhatsapp.phone_number_id,
    wabaId: cuentaWhatsapp.waba_id,
    accessToken: credencial.access_token,
  };
}

// Variante para cuando el usuario eligió un número específico en el
// asistente de plantillas (una cuenta puede tener más de un número
// conectado) en vez de "el número activo de la cuenta".
export async function obtenerCredencialesWhatsappPorId(
  admin: AdminClient,
  cuentaWhatsappId: string,
  cuentaId: string,
): Promise<CredencialesWhatsapp | null> {
  const { data: cuentaWhatsapp } = await admin
    .from("cuentas_whatsapp")
    .select("id, phone_number_id, waba_id")
    .eq("id", cuentaWhatsappId)
    .eq("cuenta_id", cuentaId)
    .maybeSingle();

  if (!cuentaWhatsapp) return null;

  const { data: credencial } = await admin
    .from("whatsapp_credenciales")
    .select("access_token")
    .eq("cuenta_whatsapp_id", cuentaWhatsapp.id)
    .maybeSingle();

  if (!credencial) return null;

  return {
    cuentaWhatsappId: cuentaWhatsapp.id,
    phoneNumberId: cuentaWhatsapp.phone_number_id,
    wabaId: cuentaWhatsapp.waba_id,
    accessToken: credencial.access_token,
  };
}
