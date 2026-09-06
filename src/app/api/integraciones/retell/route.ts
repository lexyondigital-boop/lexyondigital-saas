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
    .select("modo, numero_saliente, intervalo_minimo_llamadas_minutos, activo, connected_by, created_at")
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .eq("activo", true)
    .maybeSingle();

  const { data: cuenta } = await admin
    .from("cuentas")
    .select("retell_permite_master, retell_permite_propia")
    .eq("id", auth.perfil.cuenta_id)
    .single();

  return NextResponse.json({
    conectado: data ?? null,
    permiteMaster: cuenta?.retell_permite_master ?? true,
    permitePropia: cuenta?.retell_permite_propia ?? true,
  });
}

const INTERVALOS_VALIDOS = [2, 5, 10] as const;

// Guarda el número saliente y/o el intervalo mínimo entre llamadas al mismo
// contacto (anti-spam) -- solo tiene sentido una vez ya conectado.
export async function PATCH(request: NextRequest) {
  const auth = await requirePermiso("manage_integraciones");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { numero_saliente, intervalo_minimo_llamadas_minutos } = (await request.json()) as {
    numero_saliente?: string;
    intervalo_minimo_llamadas_minutos?: number;
  };

  if (!numero_saliente?.trim() && intervalo_minimo_llamadas_minutos === undefined) {
    return NextResponse.json({ error: "Nada que guardar" }, { status: 400 });
  }
  if (intervalo_minimo_llamadas_minutos !== undefined && !INTERVALOS_VALIDOS.includes(intervalo_minimo_llamadas_minutos as (typeof INTERVALOS_VALIDOS)[number])) {
    return NextResponse.json({ error: "Intervalo inválido" }, { status: 400 });
  }

  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (numero_saliente?.trim()) cambios.numero_saliente = numero_saliente.trim();
  if (intervalo_minimo_llamadas_minutos !== undefined) cambios.intervalo_minimo_llamadas_minutos = intervalo_minimo_llamadas_minutos;

  const admin = createAdminClient();
  const { error } = await admin.from("cuentas_retell").update(cambios).eq("cuenta_id", auth.perfil.cuenta_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermiso("manage_integraciones");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { modo, api_key } = (await request.json()) as { modo?: "master" | "propia"; api_key?: string };
  if (modo !== "master" && modo !== "propia") {
    return NextResponse.json({ error: "Falta el modo (master o propia)" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: cuenta } = await admin
    .from("cuentas")
    .select("retell_permite_master, retell_permite_propia")
    .eq("id", auth.perfil.cuenta_id)
    .single();

  if (modo === "master" && cuenta && !cuenta.retell_permite_master) {
    return NextResponse.json({ error: "Esta cuenta no tiene permitido el modo incluido (API maestra)" }, { status: 403 });
  }
  if (modo === "propia" && cuenta && !cuenta.retell_permite_propia) {
    return NextResponse.json({ error: "Esta cuenta no tiene permitido usar su propia API de Retell" }, { status: 403 });
  }

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
