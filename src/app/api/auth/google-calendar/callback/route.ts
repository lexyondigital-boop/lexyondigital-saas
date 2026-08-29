import { NextRequest, NextResponse } from "next/server";
import { leerEstadoOAuth, conectarGoogleCalendar } from "@/lib/google-calendar";
import { origenPublico } from "@/lib/origen-publico";

export async function GET(request: NextRequest) {
  const origen = origenPublico(request);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const errorGoogle = request.nextUrl.searchParams.get("error");

  if (errorGoogle) {
    return NextResponse.redirect(new URL(`/profesionales?google=error&mensaje=${encodeURIComponent(errorGoogle)}`, origen));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL(`/profesionales?google=error&mensaje=Faltan+parámetros`, origen));
  }

  const estado = leerEstadoOAuth(state);
  if (!estado) {
    return NextResponse.redirect(new URL(`/profesionales?google=error&mensaje=El+enlace+expiró,+intenta+de+nuevo`, origen));
  }

  const redirectUri = `${origen}/api/auth/google-calendar/callback`;
  const webhookUrl = `${origen}/api/webhooks/google-calendar`;

  try {
    await conectarGoogleCalendar({ profesionalId: estado.profesionalId, code, redirectUri, webhookUrl });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo conectar Google Calendar";
    return NextResponse.redirect(new URL(`${estado.volverA}?google=error&mensaje=${encodeURIComponent(mensaje)}`, origen));
  }

  return NextResponse.redirect(new URL(`${estado.volverA}?google=conectado`, origen));
}
