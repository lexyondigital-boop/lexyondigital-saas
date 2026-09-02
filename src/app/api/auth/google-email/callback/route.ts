import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leerEstadoOAuthEmail, conectarGoogleEmail } from "@/lib/google-email-oauth";
import { origenPublico } from "@/lib/origen-publico";

export async function GET(request: NextRequest) {
  const origen = origenPublico(request);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const errorGoogle = request.nextUrl.searchParams.get("error");

  if (errorGoogle) {
    return NextResponse.redirect(new URL(`/configuracion?correo=error&mensaje=${encodeURIComponent(errorGoogle)}`, origen));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL(`/configuracion?correo=error&mensaje=Faltan+parámetros`, origen));
  }

  const estado = leerEstadoOAuthEmail(state);
  if (!estado) {
    return NextResponse.redirect(new URL(`/configuracion?correo=error&mensaje=El+enlace+expiró,+intenta+de+nuevo`, origen));
  }

  const redirectUri = `${origen}/api/auth/google-email/callback`;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  try {
    await conectarGoogleEmail({ cuentaId: estado.cuentaId, code, redirectUri, connectedBy: user?.id ?? null });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo conectar el correo de Google";
    return NextResponse.redirect(new URL(`${estado.volverA}?correo=error&mensaje=${encodeURIComponent(mensaje)}`, origen));
  }

  return NextResponse.redirect(new URL(`${estado.volverA}?correo=conectado`, origen));
}
