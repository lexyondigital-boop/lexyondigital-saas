import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/require-super-admin";

// Control por excepción de qué plantillas maestras ve esta sub-cuenta --
// todas las activas son visibles por defecto (plantillas_voz_maestras_ocultas
// vacía), el super-admin oculta las que no quiere que vea. También trae, por
// plantilla, qué número (de los disponibles en esa plantilla) le asignó a
// esta sub-cuenta -- sin número asignado, la sub-cuenta no puede crear un
// agente desde esa plantilla en modo "incluido" con lexyondigital.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: plantillas, error } = await admin
    .from("plantillas_voz_maestras")
    .select("id, nombre, agente_tipo, categoria, status, retell_numeros_disponibles")
    .order("nombre", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: ocultas } = await admin.from("plantillas_voz_maestras_ocultas").select("plantilla_maestra_id").eq("cuenta_id", id);
  const idsOcultas = new Set((ocultas ?? []).map((o) => o.plantilla_maestra_id));

  const { data: asignados } = await admin
    .from("plantillas_voz_maestras_numeros_asignados")
    .select("plantilla_maestra_id, numero")
    .eq("cuenta_id", id);
  const numerosPorPlantilla = new Map((asignados ?? []).map((a) => [a.plantilla_maestra_id, a.numero]));

  return NextResponse.json({
    plantillas: (plantillas ?? []).map((p) => ({
      ...p,
      visible: !idsOcultas.has(p.id),
      numero_asignado: numerosPorPlantilla.get(p.id) ?? null,
    })),
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { plantilla_maestra_id, visible, numero } = (await request.json()) as {
    plantilla_maestra_id?: string;
    visible?: boolean;
    numero?: string | null;
  };

  if (!plantilla_maestra_id) {
    return NextResponse.json({ error: "Falta plantilla_maestra_id" }, { status: 400 });
  }
  if (typeof visible !== "boolean" && numero === undefined) {
    return NextResponse.json({ error: "Falta visible o numero" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (typeof visible === "boolean") {
    if (visible) {
      const { error } = await admin
        .from("plantillas_voz_maestras_ocultas")
        .delete()
        .eq("cuenta_id", id)
        .eq("plantilla_maestra_id", plantilla_maestra_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await admin
        .from("plantillas_voz_maestras_ocultas")
        .upsert({ cuenta_id: id, plantilla_maestra_id }, { onConflict: "cuenta_id,plantilla_maestra_id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (numero !== undefined) {
    if (numero === null) {
      const { error } = await admin
        .from("plantillas_voz_maestras_numeros_asignados")
        .delete()
        .eq("cuenta_id", id)
        .eq("plantilla_maestra_id", plantilla_maestra_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await admin
        .from("plantillas_voz_maestras_numeros_asignados")
        .upsert({ cuenta_id: id, plantilla_maestra_id, numero }, { onConflict: "cuenta_id,plantilla_maestra_id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
