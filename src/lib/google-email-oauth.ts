import { createAdminClient } from "@/lib/supabase/admin";
import { cifrar, descifrar } from "@/lib/cifrado";

// Mismo patrón que src/lib/google-calendar.ts, pero la conexión es por
// CUENTA (no por profesional) y el scope es para mandar correo, no agenda.
// Ambos comparten el mismo cliente OAuth de Google Cloud
// (GOOGLE_OAUTH_CLIENT_ID/SECRET) -- solo hace falta que la Gmail API esté
// habilitada en ese proyecto y que el scope de abajo esté agregado a la
// pantalla de consentimiento.
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/userinfo.email"];

function credenciales() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google no está configurado en la plataforma (falta GOOGLE_OAUTH_CLIENT_ID/SECRET)");
  }
  return { clientId, clientSecret };
}

export function googleEmailConfigurado() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

type EstadoOAuthEmail = { cuentaId: string; volverA: string; ts: number };

export function construirAuthUrlEmail({ redirectUri, estado }: { redirectUri: string; estado: EstadoOAuthEmail }) {
  const { clientId } = credenciales();
  const state = cifrar(JSON.stringify(estado));
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES.join(" "),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export function leerEstadoOAuthEmail(state: string): EstadoOAuthEmail | null {
  try {
    const estado = JSON.parse(descifrar(state)) as EstadoOAuthEmail;
    if (Date.now() - estado.ts > 10 * 60 * 1000) return null;
    return estado;
  } catch {
    return null;
  }
}

async function intercambiarCodigoPorTokens({ code, redirectUri }: { code: string; redirectUri: string }) {
  const { clientId, clientSecret } = credenciales();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description ?? data?.error ?? "No se pudo canjear el código de Google");
  return data as { access_token: string; refresh_token?: string; expires_in: number };
}

async function refrescarAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = credenciales();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description ?? data?.error ?? "No se pudo refrescar el token de Google");
  return data as { access_token: string; expires_in: number };
}

async function obtenerEmailDeCuenta(accessToken: string) {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return (data?.email as string) ?? null;
}

// Llamado una sola vez, en el callback de OAuth.
export async function conectarGoogleEmail({
  cuentaId,
  code,
  redirectUri,
  connectedBy,
}: {
  cuentaId: string;
  code: string;
  redirectUri: string;
  connectedBy: string | null;
}) {
  const tokens = await intercambiarCodigoPorTokens({ code, redirectUri });
  if (!tokens.refresh_token) {
    throw new Error(
      "Google no devolvió un refresh token. Si ya habías conectado esta cuenta antes, revoca el acceso en https://myaccount.google.com/permissions e inténtalo de nuevo.",
    );
  }

  const email = await obtenerEmailDeCuenta(tokens.access_token);

  const admin = createAdminClient();
  await admin.from("cuentas_correo").upsert(
    {
      cuenta_id: cuentaId,
      proveedor: "google",
      remitente_correo: email,
      google_oauth_token_cifrado: cifrar(tokens.refresh_token),
      google_oauth_email: email,
      google_oauth_connected_at: new Date().toISOString(),
      last_token_refresh: new Date().toISOString(),
      connected_by: connectedBy,
      activo: true,
      // Si la cuenta tenía SMTP configurado antes, se limpia -- solo un
      // proveedor activo a la vez.
      smtp_host: null,
      smtp_port: null,
      smtp_seguridad: null,
      smtp_usuario: null,
      smtp_password_cifrado: null,
    },
    { onConflict: "cuenta_id" },
  );
}

export async function desconectarGoogleEmail(cuentaId: string) {
  const admin = createAdminClient();
  await admin
    .from("cuentas_correo")
    .update({
      google_oauth_token_cifrado: null,
      google_oauth_email: null,
      google_oauth_connected_at: null,
      last_token_refresh: null,
    })
    .eq("cuenta_id", cuentaId)
    .eq("proveedor", "google");
}

// Devuelve un access token vigente para la cuenta, refrescándolo cada vez
// (no se persiste el access token, igual que en google-calendar.ts).
export async function obtenerAccessTokenEmailVigente(cuentaId: string, refreshTokenCifrado: string): Promise<string> {
  const refreshToken = descifrar(refreshTokenCifrado);
  const tokens = await refrescarAccessToken(refreshToken);

  const admin = createAdminClient();
  await admin.from("cuentas_correo").update({ last_token_refresh: new Date().toISOString() }).eq("cuenta_id", cuentaId);

  return tokens.access_token;
}
