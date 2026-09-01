import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";
import { resolverColumnasCsv, matchearEncabezados, procesarFilaCsv } from "@/lib/contactos-csv";
import type { PaisImportacion } from "@/lib/telefono-import";
import type { CampoPersonalizado } from "@/lib/campos-personalizados";

// Carga masiva de contactos para una campaña desde un CSV. Nunca truena todo
// el archivo por una fila mala -- cada fila se procesa y reporta aparte
// (importada / actualizada / omitida). Un contacto NUEVO queda con
// canal_origen='campaña' y el asignado_a elegido en el modal; uno que YA
// existía nunca se pisa en esos dos campos, solo se actualizan los datos que
// sí vinieron en esa fila del CSV.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("edit_campaigns");
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

  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo CSV" }, { status: 400 });
  }
  if (pais !== "MX") {
    return NextResponse.json({ error: "Elige un país válido" }, { status: 400 });
  }

  const texto = await archivo.text();
  const { data: filasCrudas } = Papa.parse<string[]>(texto, { skipEmptyLines: true });
  if (filasCrudas.length < 2) {
    return NextResponse.json({ error: "El archivo no tiene filas de datos" }, { status: 400 });
  }

  const { data: campos } = await admin.from("campos_personalizados").select("*").eq("cuenta_id", cuentaId);
  const columnas = resolverColumnasCsv((campos as CampoPersonalizado[]) ?? []);
  const { porIndice, ignorados } = matchearEncabezados(filasCrudas[0], columnas);

  const filasProcesadas = filasCrudas.slice(1).map((fila, idx) => procesarFilaCsv(idx + 2, fila, porIndice, pais));
  const filasValidas = filasProcesadas.filter((f) => f.ok && f.telefono);
  const omitidos = filasProcesadas.filter((f) => !f.ok).map((f) => ({ fila: f.numeroFila, motivo: f.motivo ?? "Error desconocido" }));

  if (filasValidas.length === 0) {
    return NextResponse.json({ importados: 0, actualizados: 0, omitidos, columnas_ignoradas: ignorados, contactos: [] });
  }

  const telefonos = [...new Set(filasValidas.map((f) => f.telefono!))];
  const { data: existentes } = await admin.from("contactos").select("id, telefono").eq("cuenta_id", cuentaId).in("telefono", telefonos);
  const existentePorTelefono = new Map((existentes ?? []).map((c) => [c.telefono, c.id]));

  // Si el mismo teléfono aparece dos veces en el archivo, se queda con la
  // última fila -- evita mandar dos filas con el mismo teléfono en el mismo
  // insert (violaría el unique cuenta_id+telefono).
  const filaPorTelefono = new Map(filasValidas.map((f) => [f.telefono!, f]));

  const nuevos = [...filaPorTelefono.entries()].filter(([tel]) => !existentePorTelefono.has(tel));
  const actualizaciones = [...filaPorTelefono.entries()].filter(([tel]) => existentePorTelefono.has(tel));

  const idsPorTelefono = new Map<string, string>(existentePorTelefono);

  if (nuevos.length > 0) {
    const filasInsert = nuevos.map(([telefono, f]) => ({
      cuenta_id: cuentaId,
      telefono,
      nombre_completo: f.camposReales?.nombre_completo ?? null,
      correo_electronico: f.camposReales?.correo_electronico ?? null,
      etiquetas: f.camposReales?.etiquetas ?? [],
      canal_origen: "campaña",
      asignado_a: asignadoA,
      status: "activo",
    }));

    const { data: insertados, error: errorInsert } = await admin.from("contactos").insert(filasInsert).select("id, telefono");
    if (errorInsert) return NextResponse.json({ error: errorInsert.message }, { status: 500 });
    for (const c of insertados ?? []) idsPorTelefono.set(c.telefono, c.id);
  }

  // Las actualizaciones van una por una a propósito: cada fila solo trae un
  // subconjunto de campos, y un upsert masivo con columnas distintas por
  // fila terminaría poniendo NULL a lo que una fila no traía -- se prefiere
  // más queries a arriesgar borrar datos de un contacto que ya existía.
  for (const [telefono, f] of actualizaciones) {
    const cambios: Record<string, unknown> = {};
    if (f.camposReales?.nombre_completo) cambios.nombre_completo = f.camposReales.nombre_completo;
    if (f.camposReales?.correo_electronico) cambios.correo_electronico = f.camposReales.correo_electronico;
    if (f.camposReales?.etiquetas?.length) cambios.etiquetas = f.camposReales.etiquetas;
    if (Object.keys(cambios).length === 0) continue;
    await admin.from("contactos").update(cambios).eq("id", idsPorTelefono.get(telefono)!);
  }

  const valoresPersonalizados = [...filaPorTelefono.entries()].flatMap(([telefono, f]) =>
    (f.valoresPersonalizados ?? []).map((v) => ({ contacto_id: idsPorTelefono.get(telefono)!, campo_id: v.campo_id, valor: v.valor })),
  );
  if (valoresPersonalizados.length > 0) {
    await admin.from("valores_campos_personalizados").upsert(valoresPersonalizados, { onConflict: "contacto_id,campo_id" });
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

  await registrarActividad({
    cuentaId,
    perfilId: auth.user.id,
    accion: "load_campaign_contacts",
    recursoTipo: "campana",
    recursoId: campanaId,
    detalles: { importados: nuevos.length, actualizados: actualizaciones.length, omitidos: omitidos.length },
    request,
  });

  return NextResponse.json({
    importados: nuevos.length,
    actualizados: actualizaciones.length,
    omitidos,
    columnas_ignoradas: ignorados,
    contactos: contactosFinales ?? [],
  });
}
