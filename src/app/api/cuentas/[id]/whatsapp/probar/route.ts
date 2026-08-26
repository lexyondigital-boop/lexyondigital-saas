import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { consultarNumero } from "@/lib/meta";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: cuenta_id } = await params;
  const admin = createAdminClient();

  const { data: cuentaWhatsapp } = await admin
    .from("cuentas_whatsapp")
    .select("id, phone_number_id")
    .eq("cuenta_id", cuenta_id)
    .maybeSingle();

  if (!cuentaWhatsapp) {
    return NextResponse.json({ error: "Esta cuenta no tiene WhatsApp conectado" }, { status: 404 });
  }

  const { data: credencial } = await admin
    .from("whatsapp_credenciales")
    .select("access_token")
    .eq("cuenta_whatsapp_id", cuentaWhatsapp.id)
    .maybeSingle();

  if (!credencial) {
    return NextResponse.json({ error: "Falta la credencial guardada" }, { status: 409 });
  }

  const consulta = await consultarNumero({
    phoneNumberId: cuentaWhatsapp.phone_number_id,
    accessToken: credencial.access_token,
  });

  if (!consulta.ok) {
    await admin.from("cuentas_whatsapp").update({ estado: "error" }).eq("id", cuentaWhatsapp.id);
    return NextResponse.json({ error: consulta.error }, { status: 502 });
  }

  await admin
    .from("cuentas_whatsapp")
    .update({ estado: "activo", numero_telefono: consulta.numero, nombre_verificado: consulta.nombreVerificado })
    .eq("id", cuentaWhatsapp.id);

  return NextResponse.json({ ok: true, numero: consulta.numero, nombreVerificado: consulta.nombreVerificado });
}
