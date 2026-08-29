import { NextRequest, NextResponse } from "next/server";
import { leerEstadoOAuth, conectarGoogleCalendar } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const errorGoogle = request.nextUrl.searchParams.get("error");

  if (errorGoogle) {
    return NextResponse.redirect(new URL(`/profesionales?google=error&mensaje=${encodeURIComponent(errorGoogle)}`, request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL(`/profesionales?google=error&mensaje=Faltan+parámetros`, request.url));
  }

  const estado = leerEstadoOAuth(state);
  if (!estado) {
    return NextResponse.redirect(new URL(`/profesionales?google=error&mensaje=El+enlace+expiró,+intenta+de+nuevo`, request.url));
  }

  const redirectUri = `${request.nextUrl.origin}/api/auth/google-calendar/callback`;

  try {
    await conectarGoogleCalendar({ profesionalId: estado.profesionalId, code, redirectUri });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo conectar Google Calendar";
    return NextResponse.redirect(new URL(`${estado.volverA}?google=error&mensaje=${encodeURIComponent(mensaje)}`, request.url));
  }

  return NextResponse.redirect(new URL(`${estado.volverA}?google=conectado`, request.url));
}
