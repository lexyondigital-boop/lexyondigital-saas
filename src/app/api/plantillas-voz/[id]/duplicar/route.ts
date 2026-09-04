import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_plantillas_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: original, error: errorOriginal } = await admin
    .from("plantillas_voz")
    .select("nombre, copyscript, objetivo, agente_tipo, categoria, plantilla_base_clave")
    .eq("id", id)
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .maybeSingle();

  if (errorOriginal || !original) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });

  let nombreCopia = `${original.nombre} (copia)`;
  for (let i = 2; ; i++) {
    const { data: existe } = await admin
      .from("plantillas_voz")
      .select("id")
      .eq("cuenta_id", auth.perfil.cuenta_id)
      .eq("nombre", nombreCopia)
      .maybeSingle();
    if (!existe) break;
    nombreCopia = `${original.nombre} (copia ${i})`;
  }

  const { data, error } = await admin
    .from("plantillas_voz")
    .insert({ ...original, cuenta_id: auth.perfil.cuenta_id, nombre: nombreCopia, publicada: false })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "duplicar_plantilla_voz",
    recursoTipo: "plantilla_voz",
    recursoId: data.id,
    request,
  });

  return NextResponse.json({ plantilla: data });
}
