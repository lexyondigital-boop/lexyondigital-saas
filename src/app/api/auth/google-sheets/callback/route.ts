import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leerEstadoOAuthSheets, conectarGoogleDrive } from "@/lib/google-sheets-oauth";
import { origenPublico } from "@/lib/origen-publico";

export async function GET(request: NextRequest) {
  const origen = origenPublico(request);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const errorGoogle = request.nextUrl.searchParams.get("error");

  if (errorGoogle) {
    return NextResponse.redirect(new URL(`/configuracion?sheets=error&mensaje=${encodeURIComponent(errorGoogle)}`, origen));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL(`/configuracion?sheets=error&mensaje=Faltan+parámetros`, origen));
  }

  const estado = leerEstadoOAuthSheets(state);
  if (!estado) {
    return NextResponse.redirect(new URL(`/configuracion?sheets=error&mensaje=El+enlace+expiró,+intenta+de+nuevo`, origen));
  }

  const redirectUri = `${origen}/api/auth/google-sheets/callback`;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  try {
    await conectarGoogleDrive({
      cuentaId: estado.cuentaId,
      profesionalId: estado.profesionalId,
      code,
      redirectUri,
      connectedBy: user?.id ?? null,
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo conectar Google Drive";
    return NextResponse.redirect(new URL(`${estado.volverA}?sheets=error&mensaje=${encodeURIComponent(mensaje)}`, origen));
  }

  return NextResponse.redirect(new URL(`${estado.volverA}?sheets=conectado`, origen));
}
