import { createAdminClient } from "@/lib/supabase/admin";
import { cifrar, descifrar } from "@/lib/cifrado";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const SCOPES = ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/userinfo.email"];

function credenciales() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google Calendar no está configurado (falta GOOGLE_OAUTH_CLIENT_ID/SECRET)");
  }
  return { clientId, clientSecret };
}

export function googleCalendarConfigurado() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

// El "state" viaja por la redirección de Google, así que va cifrado (mismo
// AES-256-GCM que las API keys) para que no se pueda falsificar qué
// profesional/cuenta se está conectando. Expira a los 10 minutos.
type EstadoOAuth = { profesionalId: string; cuentaId: string; volverA: string; ts: number };

export function construirAuthUrl({ redirectUri, estado }: { redirectUri: string; estado: EstadoOAuth }) {
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

export function leerEstadoOAuth(state: string): EstadoOAuth | null {
  try {
    const estado = JSON.parse(descifrar(state)) as EstadoOAuth;
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

async function obtenerCalendarioPrimario(accessToken: string) {
  const res = await fetch(`${CALENDAR_API}/calendars/primary`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { id: "primary", nombre: "Calendario primario" };
  const data = await res.json();
  return { id: (data?.id as string) ?? "primary", nombre: (data?.summary as string) ?? "Calendario primario" };
}

// Llamado una sola vez, en el callback de OAuth: intercambia el code,
// obtiene email + calendario, y guarda todo (refresh token cifrado) en
// la fila del profesional.
export async function conectarGoogleCalendar({
  profesionalId,
  code,
  redirectUri,
}: {
  profesionalId: string;
  code: string;
  redirectUri: string;
}) {
  const tokens = await intercambiarCodigoPorTokens({ code, redirectUri });
  if (!tokens.refresh_token) {
    throw new Error(
      "Google no devolvió un refresh token. Si ya habías conectado esta cuenta antes, revoca el acceso en https://myaccount.google.com/permissions e inténtalo de nuevo.",
    );
  }

  const [email, calendario] = await Promise.all([
    obtenerEmailDeCuenta(tokens.access_token),
    obtenerCalendarioPrimario(tokens.access_token),
  ]);

  const admin = createAdminClient();
  await admin
    .from("profesionales")
    .update({
      google_calendar_id: calendario.id,
      google_calendar_name: calendario.nombre,
      google_oauth_token_cifrado: cifrar(tokens.refresh_token),
      google_oauth_email: email,
      google_oauth_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      google_oauth_connected_at: new Date().toISOString(),
      last_token_refresh: new Date().toISOString(),
    })
    .eq("id", profesionalId);
}

export async function desconectarGoogleCalendar(profesionalId: string) {
  const admin = createAdminClient();
  await admin
    .from("profesionales")
    .update({
      google_calendar_id: null,
      google_calendar_name: null,
      google_oauth_token_cifrado: null,
      google_oauth_email: null,
      google_oauth_expires_at: null,
      google_oauth_connected_at: null,
      last_token_refresh: null,
    })
    .eq("id", profesionalId);
}

type ProfesionalGoogle = {
  id: string;
  google_calendar_id: string | null;
  google_oauth_token_cifrado: string | null;
  google_oauth_expires_at: string | null;
};

// Devuelve un access token vigente para el profesional, refrescándolo (y
// persistiendo el nuevo vencimiento) si ya expiró. null si no está
// conectado a Google Calendar.
async function obtenerAccessTokenVigente(profesional: ProfesionalGoogle): Promise<string | null> {
  if (!profesional.google_oauth_token_cifrado) return null;

  // No se persiste el access token (solo vive en memoria durante la
  // request), así que siempre se pide uno nuevo con el refresh token.
  const refreshToken = descifrar(profesional.google_oauth_token_cifrado);
  const tokens = await refrescarAccessToken(refreshToken);

  const admin = createAdminClient();
  await admin
    .from("profesionales")
    .update({
      google_oauth_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      last_token_refresh: new Date().toISOString(),
    })
    .eq("id", profesional.id);

  return tokens.access_token;
}

export type RangoOcupado = { inicio: string; fin: string };

export async function obtenerOcupacionGoogle({
  profesional,
  desde,
  hasta,
}: {
  profesional: ProfesionalGoogle;
  desde: Date;
  hasta: Date;
}): Promise<RangoOcupado[]> {
  if (!profesional.google_oauth_token_cifrado || !profesional.google_calendar_id) return [];

  const accessToken = await obtenerAccessTokenVigente(profesional);
  if (!accessToken) return [];

  const res = await fetch(`${CALENDAR_API}/freeBusy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: desde.toISOString(),
      timeMax: hasta.toISOString(),
      items: [{ id: profesional.google_calendar_id }],
    }),
  });

  if (!res.ok) return [];
  const data = await res.json();
  const busy = data?.calendars?.[profesional.google_calendar_id]?.busy ?? [];
  return busy.map((b: { start: string; end: string }) => ({ inicio: b.start, fin: b.end }));
}

export async function crearEventoGoogle({
  profesional,
  resumen,
  descripcion,
  inicio,
  fin,
}: {
  profesional: ProfesionalGoogle;
  resumen: string;
  descripcion: string;
  inicio: Date;
  fin: Date;
}): Promise<string | null> {
  if (!profesional.google_oauth_token_cifrado || !profesional.google_calendar_id) return null;

  const accessToken = await obtenerAccessTokenVigente(profesional);
  if (!accessToken) return null;

  const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(profesional.google_calendar_id)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: resumen,
      description: descripcion,
      start: { dateTime: inicio.toISOString(), timeZone: "America/Mexico_City" },
      end: { dateTime: fin.toISOString(), timeZone: "America/Mexico_City" },
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return (data?.id as string) ?? null;
}

export async function eliminarEventoGoogle({
  profesional,
  eventId,
}: {
  profesional: ProfesionalGoogle;
  eventId: string;
}): Promise<void> {
  if (!profesional.google_oauth_token_cifrado || !profesional.google_calendar_id) return;

  const accessToken = await obtenerAccessTokenVigente(profesional);
  if (!accessToken) return;

  await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(profesional.google_calendar_id)}/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
