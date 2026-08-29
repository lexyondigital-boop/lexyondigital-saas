import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { origenPublico } from "@/lib/origen-publico";

function generarSlug(nombre: string) {
  return nombre
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Solo un super_admin puede dar de alta cuentas nuevas. La sesión decide
// quién puede llamar esto; el cliente admin (service_role) es el único con
// permiso para crear el usuario de Auth del primer administrador de la
// cuenta, algo que ni el propio usuario ni RLS pueden hacer.
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (perfil?.rol !== "super_admin") {
    return NextResponse.json({ error: "Solo un super admin puede crear cuentas" }, { status: 403 });
  }

  const { nombre_cuenta, slug, giro, plan, nombre_admin, telefono_admin, email_admin } = await request.json();

  if (!nombre_cuenta?.trim() || !email_admin?.trim()) {
    return NextResponse.json({ error: "Falta nombre_cuenta o email_admin" }, { status: 400 });
  }

  const admin = createAdminClient();

  const slugFinal = (slug?.trim() ? generarSlug(slug) : generarSlug(nombre_cuenta)) || null;

  const { data: cuenta, error: cuentaError } = await admin
    .from("cuentas")
    .insert({
      nombre: nombre_cuenta.trim(),
      slug: slugFinal,
      giro: giro?.trim() || null,
      plan: plan || "trial",
    })
    .select("id, nombre, codigo, slug, giro, plan")
    .single();

  if (cuentaError) {
    return NextResponse.json({ error: cuentaError.message }, { status: 500 });
  }

  const { data: nuevoUsuario, error: authError } = await admin.auth.admin.createUser({
    email: email_admin.trim(),
    email_confirm: true,
  });

  if (authError || !nuevoUsuario.user) {
    await admin.from("cuentas").delete().eq("id", cuenta.id);
    return NextResponse.json({ error: authError?.message ?? "No se pudo crear el usuario" }, { status: 500 });
  }

  const { error: perfilError } = await admin.from("perfiles").insert({
    id: nuevoUsuario.user.id,
    cuenta_id: cuenta.id,
    nombre: nombre_admin?.trim() || null,
    telefono: telefono_admin?.trim() || null,
    rol: "admin",
    activo: true,
  });

  if (perfilError) {
    return NextResponse.json({ error: perfilError.message }, { status: 500 });
  }

  // El usuario se creó sin contraseña — este correo le manda el link con el
  // que va a definir la suya en /restablecer-contrasena.
  const clienteAnonimo = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  await clienteAnonimo.auth.resetPasswordForEmail(email_admin.trim(), {
    redirectTo: `${origenPublico(request)}/restablecer-contrasena`,
  });

  return NextResponse.json({ ok: true, cuenta, admin_email: email_admin.trim() });
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // RLS ya filtra: un super_admin ve todas, cualquier otro solo la propia.
  const { data: cuentas, error } = await supabase
    .from("cuentas")
    .select("id, nombre, codigo, slug, giro, plan, activa, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cuentaIds = (cuentas ?? []).map((c) => c.id);

  const [{ data: perfiles }, { data: whatsapps }] = await Promise.all([
    supabase.from("perfiles").select("cuenta_id").in("cuenta_id", cuentaIds),
    supabase.from("cuentas_whatsapp").select("cuenta_id, estado").in("cuenta_id", cuentaIds),
  ]);

  const usuariosPorCuenta = new Map<string, number>();
  for (const p of perfiles ?? []) {
    usuariosPorCuenta.set(p.cuenta_id, (usuariosPorCuenta.get(p.cuenta_id) ?? 0) + 1);
  }

  const whatsappPorCuenta = new Map<string, boolean>();
  for (const w of whatsapps ?? []) {
    if (w.estado === "activo") whatsappPorCuenta.set(w.cuenta_id, true);
  }

  const cuentasConDatos = (cuentas ?? []).map((c) => ({
    ...c,
    usuarios: usuariosPorCuenta.get(c.id) ?? 0,
    whatsapp_conectado: whatsappPorCuenta.get(c.id) ?? false,
  }));

  return NextResponse.json({ cuentas: cuentasConDatos });
}
