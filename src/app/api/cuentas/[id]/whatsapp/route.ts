import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { consultarNumero } from "@/lib/meta";

// Conecta (o reconecta a otro número) el WhatsApp de una sub-cuenta. No hay
// embedded signup de Meta integrado todavía -- los datos del número se
// capturan a mano desde Meta for Developers, igual que se hizo para dar de
// alta el número de prueba del CRM de Retención.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: cuenta_id } = await params;
  const { phone_number_id, waba_id, access_token } = await request.json();

  if (!phone_number_id?.trim() || !access_token?.trim()) {
    return NextResponse.json({ error: "Falta phone_number_id o access_token" }, { status: 400 });
  }

  const consulta = await consultarNumero({
    phoneNumberId: phone_number_id.trim(),
    accessToken: access_token.trim(),
  });

  if (!consulta.ok) {
    return NextResponse.json({ error: "Meta rechazó esos datos: " + consulta.error }, { status: 400 });
  }

  const admin = createAdminClient();

  // Reemplaza la conexión anterior si existía (una sola por cuenta).
  const { data: anterior } = await admin
    .from("cuentas_whatsapp")
    .select("id")
    .eq("cuenta_id", cuenta_id)
    .maybeSingle();

  if (anterior) {
    await admin.from("cuentas_whatsapp").delete().eq("id", anterior.id);
  }

  const { data: cuentaWhatsapp, error: cwError } = await admin
    .from("cuentas_whatsapp")
    .insert({
      cuenta_id,
      phone_number_id: phone_number_id.trim(),
      waba_id: waba_id?.trim() || null,
      numero_telefono: consulta.numero,
      nombre_verificado: consulta.nombreVerificado,
      estado: "activo",
    })
    .select()
    .single();

  if (cwError) {
    return NextResponse.json({ error: cwError.message }, { status: 500 });
  }

  const { error: credError } = await admin.from("whatsapp_credenciales").insert({
    cuenta_whatsapp_id: cuentaWhatsapp.id,
    access_token: access_token.trim(),
  });

  if (credError) {
    return NextResponse.json({ error: credError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, whatsapp: cuentaWhatsapp });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: cuenta_id } = await params;
  const admin = createAdminClient();

  const { error } = await admin.from("cuentas_whatsapp").delete().eq("cuenta_id", cuenta_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
