import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { cifrar } from "@/lib/cifrado";
import { registrarActividad } from "@/lib/auditoria";

export async function POST(request: NextRequest) {
  const auth = await requirePermiso("manage_email");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json();
  const { host, port, seguridad, usuario, password, remitente_nombre, remitente_correo } = body as {
    host?: string;
    port?: number;
    seguridad?: "ssl" | "tls" | "ninguna";
    usuario?: string;
    password?: string;
    remitente_nombre?: string;
    remitente_correo?: string;
  };

  if (!host || !port || !usuario || !password || !remitente_correo) {
    return NextResponse.json({ error: "Faltan datos del SMTP (host, puerto, usuario, contraseña, correo remitente)" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("cuentas_correo").upsert(
    {
      cuenta_id: auth.perfil.cuenta_id,
      proveedor: "smtp",
      remitente_nombre: remitente_nombre?.trim() || null,
      remitente_correo: remitente_correo.trim(),
      smtp_host: host.trim(),
      smtp_port: port,
      smtp_seguridad: seguridad ?? "tls",
      smtp_usuario: usuario.trim(),
      smtp_password_cifrado: cifrar(password),
      connected_by: auth.user.id,
      activo: true,
      // Si la cuenta tenía Gmail conectado antes, se limpia -- solo un
      // proveedor activo a la vez.
      google_oauth_token_cifrado: null,
      google_oauth_email: null,
      google_oauth_connected_at: null,
      last_token_refresh: null,
    },
    { onConflict: "cuenta_id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await registrarActividad({ cuentaId: auth.perfil.cuenta_id, perfilId: auth.user.id, accion: "save_smtp_email", request });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const auth = await requirePermiso("manage_email");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  await admin.from("cuentas_correo").delete().eq("cuenta_id", auth.perfil.cuenta_id).eq("proveedor", "smtp");

  await registrarActividad({ cuentaId: auth.perfil.cuenta_id, perfilId: auth.user.id, accion: "disconnect_email" });

  return NextResponse.json({ ok: true });
}
