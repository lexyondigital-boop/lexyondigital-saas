import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { cifrar } from "@/lib/cifrado";
import { registrarActividad } from "@/lib/auditoria";

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
    .select("activo, connected_by, created_at")
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .eq("activo", true)
    .maybeSingle();

  return NextResponse.json({ conectado: data ?? null });
}

// Valida la API key contra Retell ANTES de guardar nada -- así no se
// arriesga a dejar guardada una key que no sirve.
async function validarApiKeyRetell(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.retellai.com/v2/list-agents", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });
    if (res.status === 401) return { ok: false, error: "La API key no es válida" };
    if (!res.ok) return { ok: false, error: `Retell respondió con un error (${res.status})` };
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo conectar con Retell" };
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermiso("manage_integraciones");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { api_key } = (await request.json()) as { api_key?: string };
  if (!api_key?.trim()) {
    return NextResponse.json({ error: "Falta la API key" }, { status: 400 });
  }

  const validacion = await validarApiKeyRetell(api_key.trim());
  if (!validacion.ok) {
    return NextResponse.json({ error: validacion.error }, { status: 502 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("cuentas_retell").upsert(
    {
      cuenta_id: auth.perfil.cuenta_id,
      api_key_cifrada: cifrar(api_key.trim()),
      activo: true,
      connected_by: auth.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cuenta_id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
