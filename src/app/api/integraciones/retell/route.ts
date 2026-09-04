import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { cifrar } from "@/lib/cifrado";
import { registrarActividad } from "@/lib/auditoria";
import { validarApiKeyRetell, resolverLlaveMaestraRetell } from "@/lib/retell";

// cuentas_retell guarda un secreto cifrado -- el estado que ve el
// frontend se sirve por esta ruta server-side con el cliente admin,
// seleccionando solo columnas no secretas, en vez de exponer la tabla
// por lectura directa RLS (mismo patrón que /api/cuentas-correo).
export async function GET() {
  const auth = await requirePermiso("manage_integraciones");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data } = await admin
    .from("cuentas_retell")
    .select("modo, activo, connected_by, created_at")
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .eq("activo", true)
    .maybeSingle();

  return NextResponse.json({ conectado: data ?? null });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermiso("manage_integraciones");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { modo, api_key } = (await request.json()) as { modo?: "master" | "propia"; api_key?: string };
  if (modo !== "master" && modo !== "propia") {
    return NextResponse.json({ error: "Falta el modo (master o propia)" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (modo === "propia") {
    if (!api_key?.trim()) {
      return NextResponse.json({ error: "Falta la API key" }, { status: 400 });
    }
    const validacion = await validarApiKeyRetell(api_key.trim());
    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: 502 });
    }

    const { error } = await admin.from("cuentas_retell").upsert(
      {
        cuenta_id: auth.perfil.cuenta_id,
        modo,
        api_key_cifrada: cifrar(api_key.trim()),
        activo: true,
        connected_by: auth.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cuenta_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const llaveMaestra = await resolverLlaveMaestraRetell(admin);
    if (!llaveMaestra) {
      return NextResponse.json({ error: "Lexyondigital todavía no configuró su API key maestra de Retell" }, { status: 409 });
    }

    const { error } = await admin.from("cuentas_retell").upsert(
      {
        cuenta_id: auth.perfil.cuenta_id,
        modo,
        api_key_cifrada: null,
        activo: true,
        connected_by: auth.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cuenta_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await registrarActividad({ cuentaId: auth.perfil.cuenta_id, perfilId: auth.user.id, accion: "connect_retell", request });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermiso("manage_integraciones");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  await admin.from("cuentas_retell").delete().eq("cuenta_id", auth.perfil.cuenta_id);

  await registrarActividad({ cuentaId: auth.perfil.cuenta_id, perfilId: auth.user.id, accion: "disconnect_retell", request });

  return NextResponse.json({ ok: true });
}
