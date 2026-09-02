import nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";
import { descifrar } from "@/lib/cifrado";
import { obtenerAccessTokenEmailVigente } from "@/lib/google-email-oauth";

type AdminClient = ReturnType<typeof createAdminClient>;

// {{clave}} en asunto/cuerpo se sustituye por el valor resuelto; si no hay
// valor para esa clave, se deja el placeholder tal cual (mejor visible que
// un correo con huecos silenciosos).
export function reemplazarVariablesEmail(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (match, clave) => valores[clave] ?? match);
}

export function extraerClavesVariables(...textos: string[]): string[] {
  const claves = new Set<string>();
  for (const texto of textos) {
    for (const m of texto.matchAll(/\{\{(\w+)\}\}/g)) claves.add(m[1]);
  }
  return [...claves];
}

type CuentaCorreo = {
  proveedor: "google" | "smtp";
  remitente_nombre: string | null;
  remitente_correo: string | null;
  google_oauth_token_cifrado: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_seguridad: "ssl" | "tls" | "ninguna" | null;
  smtp_usuario: string | null;
  smtp_password_cifrado: string | null;
};

// Arma un mensaje RFC 2822 mínimo (From/To/Subject/HTML) y lo manda con
// gmail.users.messages.send -- fetch crudo contra la API REST, mismo
// criterio que google-calendar.ts (sin el SDK googleapis).
async function enviarConGmail(cuentaId: string, cuenta: CuentaCorreo, destinatario: string, asunto: string, cuerpoHtml: string) {
  if (!cuenta.google_oauth_token_cifrado) throw new Error("Gmail no está conectado para esta cuenta");

  const accessToken = await obtenerAccessTokenEmailVigente(cuentaId, cuenta.google_oauth_token_cifrado);
  const remitente = cuenta.remitente_nombre ? `${cuenta.remitente_nombre} <${cuenta.remitente_correo}>` : (cuenta.remitente_correo ?? "");

  const mensaje = [
    `From: ${remitente}`,
    `To: ${destinatario}`,
    `Subject: =?UTF-8?B?${Buffer.from(asunto, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    cuerpoHtml,
  ].join("\r\n");

  const raw = Buffer.from(mensaje).toString("base64url");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message ?? "Gmail rechazó el envío");
  }
}

async function enviarConSmtp(cuenta: CuentaCorreo, destinatario: string, asunto: string, cuerpoHtml: string) {
  if (!cuenta.smtp_host || !cuenta.smtp_port || !cuenta.smtp_usuario || !cuenta.smtp_password_cifrado) {
    throw new Error("El SMTP de esta cuenta no está configurado por completo");
  }

  const transportador = nodemailer.createTransport({
    host: cuenta.smtp_host,
    port: cuenta.smtp_port,
    secure: cuenta.smtp_seguridad === "ssl",
    requireTLS: cuenta.smtp_seguridad === "tls",
    auth: { user: cuenta.smtp_usuario, pass: descifrar(cuenta.smtp_password_cifrado) },
  });

  await transportador.sendMail({
    from: cuenta.remitente_nombre ? `"${cuenta.remitente_nombre}" <${cuenta.remitente_correo ?? cuenta.smtp_usuario}>` : (cuenta.remitente_correo ?? cuenta.smtp_usuario),
    to: destinatario,
    subject: asunto,
    html: cuerpoHtml,
  });
}

export async function enviarCorreo({
  cuentaId,
  contactoId,
  citaId,
  campanaId,
  destinatario,
  asunto,
  cuerpoHtml,
}: {
  cuentaId: string;
  contactoId?: string | null;
  citaId?: string | null;
  campanaId?: string | null;
  destinatario: string;
  asunto: string;
  cuerpoHtml: string;
}): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();

  const { data: cuenta } = await admin
    .from("cuentas_correo")
    .select(
      "proveedor, remitente_nombre, remitente_correo, google_oauth_token_cifrado, smtp_host, smtp_port, smtp_seguridad, smtp_usuario, smtp_password_cifrado",
    )
    .eq("cuenta_id", cuentaId)
    .eq("activo", true)
    .maybeSingle();

  let error: string | undefined;

  if (!cuenta) {
    error = "La cuenta no tiene correo conectado";
  } else {
    try {
      if (cuenta.proveedor === "google") await enviarConGmail(cuentaId, cuenta, destinatario, asunto, cuerpoHtml);
      else await enviarConSmtp(cuenta, destinatario, asunto, cuerpoHtml);
    } catch (e) {
      error = e instanceof Error ? e.message : "No se pudo enviar el correo";
    }
  }

  await registrarCorreoEnviado(admin, { cuentaId, contactoId, citaId, campanaId, destinatario, asunto, error });

  return error ? { ok: false, error } : { ok: true };
}

async function registrarCorreoEnviado(
  admin: AdminClient,
  params: {
    cuentaId: string;
    contactoId?: string | null;
    citaId?: string | null;
    campanaId?: string | null;
    destinatario: string;
    asunto: string;
    error?: string;
  },
) {
  const { cuentaId, contactoId, citaId, campanaId, destinatario, asunto, error } = params;
  await admin.from("correos_enviados").insert({
    cuenta_id: cuentaId,
    contacto_id: contactoId ?? null,
    cita_id: citaId ?? null,
    campana_id: campanaId ?? null,
    destinatario,
    asunto,
    estado: error ? "fallido" : "enviado",
    error: error ?? null,
  });
}
