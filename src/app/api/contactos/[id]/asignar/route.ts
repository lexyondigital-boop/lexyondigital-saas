import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

// Mismo patrón que src/app/api/deals/[id]/asignar/route.ts -- contactos no
// tenía ningún concepto de "dueño" hasta ahora (a diferencia de deals, que
// ya tiene propietario_id).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("edit_contacts");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { asignado_a } = (await request.json()) as { asignado_a?: string | null };

  const admin = createAdminClient();

  const { data: nuevoAsignado } = asignado_a
    ? await admin.from("perfiles").select("nombre").eq("id", asignado_a).eq("cuenta_id", auth.perfil.cuenta_id).maybeSingle()
    : { data: null };

  if (asignado_a && !nuevoAsignado) {
    return NextResponse.json({ error: "Ese usuario no pertenece a esta cuenta" }, { status: 400 });
  }

  const { error } = await admin
    .from("contactos")
    .update({ asignado_a: asignado_a || null })
    .eq("id", id)
    .eq("cuenta_id", auth.perfil.cuenta_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "assign_contact",
    recursoTipo: "contacto",
    recursoId: id,
    detalles: { asignado: nuevoAsignado?.nombre ?? "sin asignar" },
    request,
  });

  return NextResponse.json({ ok: true });
}
