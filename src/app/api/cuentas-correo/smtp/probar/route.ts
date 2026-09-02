import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { requirePermiso } from "@/lib/require-permiso";

// Prueba las credenciales SMTP ANTES de guardarlas -- manda un correo de
// prueba al mismo remitente, así el usuario confirma que funcionan sin
// arriesgarse a guardar algo roto (mismo espíritu que
// /api/cuentas/[id]/whatsapp/probar, pero aquí se prueba antes de guardar
// en vez de después, porque no hay nada que guardar todavía si falla).
export async function POST(request: NextRequest) {
  const auth = await requirePermiso("manage_email");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json();
  const { host, port, seguridad, usuario, password, remitente_correo } = body as {
    host?: string;
    port?: number;
    seguridad?: "ssl" | "tls" | "ninguna";
    usuario?: string;
    password?: string;
    remitente_correo?: string;
  };

  if (!host || !port || !usuario || !password || !remitente_correo) {
    return NextResponse.json({ error: "Faltan datos del SMTP (host, puerto, usuario, contraseña, correo remitente)" }, { status: 400 });
  }

  try {
    const transportador = nodemailer.createTransport({
      host,
      port,
      secure: seguridad === "ssl",
      requireTLS: seguridad === "tls",
      auth: { user: usuario, pass: password },
    });

    await transportador.verify();
    await transportador.sendMail({
      from: remitente_correo,
      to: remitente_correo,
      subject: "Correo de prueba — LexyonDigital",
      html: "<p>Este es un correo de prueba: tu conexión SMTP funciona correctamente.</p>",
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo conectar con ese servidor SMTP";
    return NextResponse.json({ error: mensaje }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
