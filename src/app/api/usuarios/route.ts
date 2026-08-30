import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminCuenta } from "@/lib/require-admin-cuenta";
import { registrarActividad, registrarCambioPermiso } from "@/lib/auditoria";
import { origenPublico } from "@/lib/origen-publico";

// Autoservicio: el admin de una sub-cuenta da de alta gente de su propio
// equipo. Distinto de /api/cuentas/[id]/usuarios, que es del panel del
// super admin para cualquier sub-cuenta.
export async function POST(request: NextRequest) {
  const auth = await requireAdminCuenta();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { nombre, email, telefono, rol, equipo_id, permisos, es_profesional, profesional } = await request.json();

  if (!email?.trim() || !nombre?.trim()) {
    return NextResponse.json({ error: "Falta nombre o correo" }, { status: 400 });
  }

  if (!telefono?.trim()) {
    return NextResponse.json({ error: "El teléfono es obligatorio" }, { status: 400 });
  }

  if (rol !== "admin" && rol !== "agente") {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  if (es_profesional && !profesional?.especialidad?.trim()) {
    return NextResponse.json({ error: "Falta la especialidad del profesionista" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Si el correo ya pertenece a alguien de esta misma cuenta (ej. el propio
  // admin que también es profesionista), no se puede crear un usuario de
  // Auth nuevo -- el correo ya está tomado. En vez de fallar, se reutiliza
  // ese perfil existente: solo se agrega el registro de profesionales
  // (o se informa que ya es profesional, si ya lo era).
  const { data: perfilesDeLaCuenta } = await admin
    .from("perfiles")
    .select("id, profesional_id")
    .eq("cuenta_id", auth.perfil.cuenta_id);

  let perfilExistente: { id: string; profesional_id: string | null } | null = null;
  for (const p of perfilesDeLaCuenta ?? []) {
    const { data } = await admin.auth.admin.getUserById(p.id);
    if (data.user?.email?.toLowerCase() === email.trim().toLowerCase()) {
      perfilExistente = p;
      break;
    }
  }

  if (perfilExistente && es_profesional) {
    if (perfilExistente.profesional_id) {
      return NextResponse.json({ error: "Ese usuario ya está registrado como profesional." }, { status: 409 });
    }

    const { data: nuevoProfesional, error: profesionalError } = await admin
      .from("profesionales")
      .insert({
        cuenta_id: auth.perfil.cuenta_id,
        perfil_id: perfilExistente.id,
        nombre: nombre.trim(),
        especialidad: profesional.especialidad.trim(),
        email: profesional.email_google?.trim() || email.trim(),
        telefono: telefono.trim(),
        color_agenda: profesional.color_agenda || "#6b2fa0",
      })
      .select("id")
      .single();

    if (profesionalError) {
      return NextResponse.json({ error: profesionalError.message }, { status: 500 });
    }

    await admin
      .from("perfiles")
      .update({ profesional_id: nuevoProfesional.id, es_profesional: true })
      .eq("id", perfilExistente.id);

    await registrarActividad({
      cuentaId: auth.perfil.cuenta_id,
      perfilId: auth.user.id,
      accion: "attach_professional",
      recursoTipo: "user",
      recursoId: perfilExistente.id,
      detalles: { nombre: nombre.trim(), email: email.trim() },
      request,
    });

    return NextResponse.json({ ok: true });
  }

  if (perfilExistente) {
    return NextResponse.json({ error: "Ya existe un usuario con ese correo en tu equipo." }, { status: 409 });
  }

  const { data: nuevoUsuario, error: authError } = await admin.auth.admin.createUser({
    email: email.trim(),
    email_confirm: true,
  });

  if (authError || !nuevoUsuario.user) {
    return NextResponse.json({ error: authError?.message ?? "No se pudo crear el usuario" }, { status: 500 });
  }

  const { error: perfilError } = await admin.from("perfiles").insert({
    id: nuevoUsuario.user.id,
    cuenta_id: auth.perfil.cuenta_id,
    nombre: nombre.trim(),
    telefono: telefono.trim(),
    rol,
    equipo_id: equipo_id || null,
    activo: true,
    es_profesional: Boolean(es_profesional),
  });

  if (perfilError) {
    await admin.auth.admin.deleteUser(nuevoUsuario.user.id);
    return NextResponse.json({ error: perfilError.message }, { status: 500 });
  }

  if (es_profesional) {
    const { data: nuevoProfesional, error: profesionalError } = await admin
      .from("profesionales")
      .insert({
        cuenta_id: auth.perfil.cuenta_id,
        perfil_id: nuevoUsuario.user.id,
        nombre: nombre.trim(),
        especialidad: profesional.especialidad.trim(),
        email: profesional.email_google?.trim() || email.trim(),
        telefono: telefono.trim(),
        color_agenda: profesional.color_agenda || "#6b2fa0",
      })
      .select("id")
      .single();

    if (profesionalError) {
      await admin.auth.admin.deleteUser(nuevoUsuario.user.id);
      return NextResponse.json({ error: profesionalError.message }, { status: 500 });
    }

    await admin.from("perfiles").update({ profesional_id: nuevoProfesional.id }).eq("id", nuevoUsuario.user.id);
  }

  if (Array.isArray(permisos) && permisos.length > 0) {
    await admin.from("perfil_permisos").insert(
      permisos.map((p: { clave: string; concedido: boolean }) => ({
        cuenta_id: auth.perfil.cuenta_id,
        perfil_id: nuevoUsuario.user!.id,
        permiso_clave: p.clave,
        concedido: p.concedido,
      })),
    );

    for (const p of permisos as { clave: string; concedido: boolean }[]) {
      await registrarCambioPermiso({
        cuentaId: auth.perfil.cuenta_id,
        perfilId: nuevoUsuario.user.id,
        cambiadoPor: auth.user.id,
        permisoClave: p.clave,
        valorAnterior: null,
        valorNuevo: p.concedido,
        tipoCambio: p.concedido ? "concedido" : "revocado",
        razon: "Asignado al crear el usuario",
      });
    }
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "create_user",
    recursoTipo: "user",
    recursoId: nuevoUsuario.user.id,
    detalles: { nombre: nombre.trim(), email: email.trim(), rol },
    request,
  });

  const clienteAnonimo = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  await clienteAnonimo.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${origenPublico(request)}/restablecer-contrasena`,
  });

  return NextResponse.json({ ok: true });
}
