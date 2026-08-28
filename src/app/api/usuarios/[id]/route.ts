import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminCuenta } from "@/lib/require-admin-cuenta";
import { registrarActividad, registrarCambioPermiso } from "@/lib/auditoria";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminCuenta();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json();
  const admin = createAdminClient();

  const { data: perfilActual } = await admin
    .from("perfiles")
    .select("*")
    .eq("id", id)
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .single();

  if (!perfilActual) {
    return NextResponse.json({ error: "Usuario no encontrado en tu cuenta" }, { status: 404 });
  }

  const cambios: Record<string, unknown> = {};
  if (typeof body.nombre === "string") cambios.nombre = body.nombre.trim() || null;
  if (body.rol === "admin" || body.rol === "agente") cambios.rol = body.rol;
  if ("equipo_id" in body) cambios.equipo_id = body.equipo_id || null;
  if (typeof body.activo === "boolean") cambios.activo = body.activo;

  if (Object.keys(cambios).length > 0) {
    const { error } = await admin.from("perfiles").update(cambios).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (typeof cambios.rol === "string" && cambios.rol !== perfilActual.rol) {
    await registrarCambioPermiso({
      cuentaId: auth.perfil.cuenta_id,
      perfilId: id,
      cambiadoPor: auth.user.id,
      permisoClave: "rol",
      valorAnterior: null,
      valorNuevo: null,
      tipoCambio: "cambio_rol",
      razon: `${perfilActual.rol} → ${cambios.rol}${body.razon ? " — " + body.razon : ""}`,
    });
  }

  if (Array.isArray(body.permisos)) {
    for (const p of body.permisos as { clave: string; concedido: boolean }[]) {
      const { data: existente } = await admin
        .from("perfil_permisos")
        .select("concedido")
        .eq("perfil_id", id)
        .eq("permiso_clave", p.clave)
        .maybeSingle();

      const anterior = existente ? existente.concedido : null;
      if (anterior === p.concedido) continue;

      await admin
        .from("perfil_permisos")
        .upsert(
          { cuenta_id: auth.perfil.cuenta_id, perfil_id: id, permiso_clave: p.clave, concedido: p.concedido },
          { onConflict: "perfil_id,permiso_clave" },
        );

      await registrarCambioPermiso({
        cuentaId: auth.perfil.cuenta_id,
        perfilId: id,
        cambiadoPor: auth.user.id,
        permisoClave: p.clave,
        valorAnterior: anterior,
        valorNuevo: p.concedido,
        tipoCambio: p.concedido ? "concedido" : "revocado",
        razon: body.razon,
      });
    }
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: cambios.activo === false ? "deactivate_user" : "edit_user",
    recursoTipo: "user",
    recursoId: id,
    detalles: cambios,
    request,
  });

  return NextResponse.json({ ok: true });
}
