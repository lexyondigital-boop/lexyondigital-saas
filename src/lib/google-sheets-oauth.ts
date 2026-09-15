import { createAdminClient } from "@/lib/supabase/admin";
import { cifrar, descifrar } from "@/lib/cifrado";

// Mismo patrón que src/lib/google-email-oauth.ts. Comparten el cliente OAuth
// de Google Cloud (GOOGLE_OAUTH_CLIENT_ID/SECRET); hace falta habilitar las
// APIs de Drive y Sheets en ese proyecto y agregar los scopes de abajo a la
// pantalla de consentimiento.
//
// Sobre el scope: `drive.file` da acceso solo a los archivos que la propia
// app creó, o a los que el usuario le entregue explícitamente por el Google
// Picker. Listar o buscar en todo el Drive del usuario exigiría
// `drive.readonly`, que Google clasifica como restringido y condiciona a una
// evaluación de seguridad anual por un tercero certificado. El Picker da la
// misma experiencia sin ese trámite.
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
];

function credenciales() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google no está configurado en la plataforma (falta GOOGLE_OAUTH_CLIENT_ID/SECRET)");
  }
  return { clientId, clientSecret };
}

export function googleSheetsConfigurado() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

type EstadoOAuthSheets = { cuentaId: string; profesionalId: string | null; volverA: string; ts: number };

export function construirAuthUrlSheets({ redirectUri, estado }: { redirectUri: string; estado: EstadoOAuthSheets }) {
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

export function leerEstadoOAuthSheets(state: string): EstadoOAuthSheets | null {
  try {
    const estado = JSON.parse(descifrar(state)) as EstadoOAuthSheets;
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
export async function conectarGoogleDrive({
  cuentaId,
  profesionalId,
  code,
  redirectUri,
  connectedBy,
}: {
  cuentaId: string;
  profesionalId: string | null;
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
  if (!email) throw new Error("Google no devolvió el correo de la cuenta");

  const admin = createAdminClient();
  await admin.from("cuentas_google_drive").upsert(
    {
      cuenta_id: cuentaId,
      profesional_id: profesionalId,
      google_email: email,
      refresh_token_cifrado: cifrar(tokens.refresh_token),
      activo: true,
      connected_by: connectedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cuenta_id,google_email" },
  );

  return email;
}

export async function desconectarGoogleDrive({ cuentaId, id }: { cuentaId: string; id: string }) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cuentas_google_drive")
    .select("refresh_token_cifrado")
    .eq("id", id)
    .eq("cuenta_id", cuentaId)
    .maybeSingle();

  if (!data) return false;

  // Se revoca en Google antes de borrar. Si falla (token ya revocado desde
  // myaccount.google.com, red caída), igual se borra la fila: dejarla sería
  // peor, porque la pantalla seguiría ofreciendo una conexión muerta.
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: descifrar(data.refresh_token_cifrado) }),
    });
  } catch {
    // best-effort
  }

  await admin.from("cuentas_google_drive").delete().eq("id", id).eq("cuenta_id", cuentaId);
  return true;
}

// Devuelve un access token vigente, refrescándolo cada vez (no se persiste
// el access token, igual que en google-calendar.ts y google-email-oauth.ts).
export async function obtenerAccessTokenDriveVigente(refreshTokenCifrado: string): Promise<string> {
  const tokens = await refrescarAccessToken(descifrar(refreshTokenCifrado));
  return tokens.access_token;
}
