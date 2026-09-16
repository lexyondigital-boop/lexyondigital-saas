import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";
import { importarContactosDesdeFilas } from "@/lib/importar-contactos";
import type { PaisImportacion } from "@/lib/telefono-import";

// Carga masiva de contactos para una campaña desde un CSV. Nunca truena todo
// el archivo por una fila mala -- cada fila se procesa y reporta aparte
// (importada / actualizada / omitida). Un contacto NUEVO queda con
// canal_origen='campaña' y el asignado_a elegido en el modal; uno que YA
// existía nunca se pisa en esos dos campos, solo se actualizan los datos que
// sí vinieron en esa fila del CSV.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso(["edit_campaigns", "import_contacts"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: campanaId } = await params;
  const cuentaId = auth.perfil.cuenta_id;
  const admin = createAdminClient();

  const { data: campana } = await admin.from("campanas").select("id").eq("id", campanaId).eq("cuenta_id", cuentaId).maybeSingle();
  if (!campana) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const formData = await request.formData();
  const archivo = formData.get("archivo");
  const pais = (formData.get("pais") as string | null) as PaisImportacion | null;
  const asignadoA = (formData.get("asignado_a") as string | null) || null;
  // El usuario ya vio (vía /verificar) cuántos de estos teléfonos ya existen
  // y decidió si quiere pisar sus datos con lo que traiga este archivo --
  // "Nombre (WhatsApp)" nunca se toca de aquí para abajo, se autocaptura solo.
  const actualizarExistentes = formData.get("actualizar_existentes") !== "0";

  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo CSV" }, { status: 400 });
  }
  if (pais !== "MX") {
    return NextResponse.json({ error: "Elige un país válido" }, { status: 400 });
  }

  const texto = await archivo.text();
  const { data: filasCrudas } = Papa.parse<string[]>(texto, { skipEmptyLines: true });

  const resultado = await importarContactosDesdeFilas({
    admin,
    cuentaId,
    filasCrudas,
    pais,
    asignadoA,
    actualizarExistentes,
    canalOrigen: "campaña",
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  }

  const { importados, actualizados, omitidos, columnasIgnoradas, idsPorTelefono, idsNuevos } = resultado;

  if (idsPorTelefono.size === 0) {
    return NextResponse.json({ importados: 0, actualizados: 0, omitidos, columnas_ignoradas: columnasIgnoradas, contactos: [] });
  }

  const filasCampanaContactos = [...idsPorTelefono.values()].map((contactoId) => ({
    campana_id: campanaId,
    contacto_id: contactoId,
    status: "pendiente",
  }));
  await admin.from("campana_contactos").upsert(filasCampanaContactos, { onConflict: "campana_id,contacto_id", ignoreDuplicates: true });

  const { count: totalDestinatarios } = await admin
    .from("campana_contactos")
    .select("id", { count: "exact", head: true })
    .eq("campana_id", campanaId);

  await admin.from("campanas").update({ total_destinatarios: totalDestinatarios ?? 0 }).eq("id", campanaId);

  const { data: contactosFinales } = await admin
    .from("contactos")
    .select("*")
    .in("id", [...idsPorTelefono.values()]);

  // Se incluyen los valores de variables personalizadas (ej. fecha_visita,
  // turno_visita) para que la pantalla de revisión pueda mostrar TODAS las
  // columnas del layout cargado, no solo las fijas -- si no, el admin ve una
  // tabla incompleta aunque el dato sí se haya guardado bien.
  const { data: valoresFinales } = await admin
    .from("valores_campos_personalizados")
    .select("contacto_id, campo_id, valor")
    .in("contacto_id", [...idsPorTelefono.values()]);

  const valoresPorContacto: Record<string, Record<string, string>> = {};
  for (const v of valoresFinales ?? []) {
    if (!valoresPorContacto[v.contacto_id]) valoresPorContacto[v.contacto_id] = {};
    valoresPorContacto[v.contacto_id][v.campo_id] = v.valor;
  }
  const contactosConValores = (contactosFinales ?? []).map((c) => ({
    ...c,
    valores_personalizados: valoresPorContacto[c.id] ?? {},
  }));

  await registrarActividad({
    cuentaId,
    perfilId: auth.user.id,
    accion: "load_campaign_contacts",
    recursoTipo: "campana",
    recursoId: campanaId,
    detalles: { importados, actualizados, omitidos: omitidos.length, actualizarExistentes },
    request,
  });

  return NextResponse.json({
    importados,
    actualizados,
    omitidos,
    columnas_ignoradas: columnasIgnoradas,
    contactos: contactosConValores,
    // Contactos que este lote creó de cero (no existían antes) -- son los
    // únicos que "Cancelar" en la revisión puede borrar. Uno que ya existía
    // y solo se actualizó nunca debe desaparecer por cancelar una carga.
    ids_nuevos: idsNuevos,
  });
}

// Deshace una carga: borra SOLO los contactos que esa carga creó de cero
// (nunca uno que ya existía y solo se actualizó). Se usa desde "Cancelar" en
// la pantalla de revisión, cuando el usuario decide no quedarse con lo que
// acaba de subir. El cascade de campana_contactos / valores_campos_personalizados
// se encarga de limpiar lo demás.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso(["edit_campaigns", "import_contacts"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: campanaId } = await params;
  const cuentaId = auth.perfil.cuenta_id;
  const admin = createAdminClient();

  const { data: campana } = await admin.from("campanas").select("id").eq("id", campanaId).eq("cuenta_id", cuentaId).maybeSingle();
  if (!campana) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => typeof id === "string") : [];
  if (ids.length === 0) return NextResponse.json({ ok: true, eliminados: 0 });

  const { error, count } = await admin
    .from("contactos")
    .delete({ count: "exact" })
    .eq("cuenta_id", cuentaId)
    .in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count: totalDestinatarios } = await admin
    .from("campana_contactos")
    .select("id", { count: "exact", head: true })
    .eq("campana_id", campanaId);
  await admin.from("campanas").update({ total_destinatarios: totalDestinatarios ?? 0 }).eq("id", campanaId);

  await registrarActividad({
    cuentaId,
    perfilId: auth.user.id,
    accion: "cancel_campaign_contacts_load",
    recursoTipo: "campana",
    recursoId: campanaId,
    detalles: { eliminados: count ?? ids.length },
    request,
  });

  return NextResponse.json({ ok: true, eliminados: count ?? ids.length });
}
