import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

export async function POST(request: NextRequest) {
  const auth = await requirePermiso("manage_deals");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { titulo, valor, contacto_id, etapa_id, propietario_id, fecha_cierre_estimada } = await request.json();

  if (!titulo?.trim()) {
    return NextResponse.json({ error: "Falta el título del deal" }, { status: 400 });
  }
  if (!etapa_id) {
    return NextResponse.json({ error: "Falta la etapa inicial" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("deals")
    .insert({
      cuenta_id: auth.perfil.cuenta_id,
      titulo: titulo.trim(),
      valor: typeof valor === "number" ? valor : 0,
      contacto_id: contacto_id || null,
      etapa_id,
      propietario_id: propietario_id || auth.user.id,
      fecha_cierre_estimada: fecha_cierre_estimada || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "create_deal",
    recursoTipo: "deal",
    recursoId: data.id,
    detalles: { titulo: titulo.trim(), valor: data.valor },
    request,
  });

  return NextResponse.json({ ok: true, deal: data });
}
