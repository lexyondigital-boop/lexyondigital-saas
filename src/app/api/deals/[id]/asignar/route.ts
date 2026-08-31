import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_deals");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { propietario_id } = (await request.json()) as { propietario_id?: string | null };

  const admin = createAdminClient();

  const { data: nuevoPropietario } = propietario_id
    ? await admin.from("perfiles").select("nombre").eq("id", propietario_id).eq("cuenta_id", auth.perfil.cuenta_id).maybeSingle()
    : { data: null };

  if (propietario_id && !nuevoPropietario) {
    return NextResponse.json({ error: "Ese usuario no pertenece a esta cuenta" }, { status: 400 });
  }

  const { error } = await admin
    .from("deals")
    .update({ propietario_id: propietario_id || null, ultima_actividad_en: new Date().toISOString() })
    .eq("id", id)
    .eq("cuenta_id", auth.perfil.cuenta_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "assign_deal",
    recursoTipo: "deal",
    recursoId: id,
    detalles: { propietario: nuevoPropietario?.nombre ?? "sin asignar" },
    request,
  });

  return NextResponse.json({ ok: true });
}
