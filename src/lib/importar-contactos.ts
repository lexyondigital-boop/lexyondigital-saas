import { createAdminClient } from "@/lib/supabase/admin";
import { resolverColumnasCsv, matchearEncabezados, procesarFilaCsv } from "@/lib/contactos-csv";
import type { PaisImportacion } from "@/lib/telefono-import";
import type { CampoPersonalizado } from "@/lib/campos-personalizados";

type AdminClient = ReturnType<typeof createAdminClient>;

// Núcleo de la carga masiva de contactos, compartido por la importación de
// campañas (que además vincula los contactos a la campaña) y la de la
// pantalla de Contactos. Vivía dentro de la ruta de campañas; se extrajo al
// sumar el segundo consumidor, porque son reglas sutiles ganadas a golpes
// -- no pisar campos que una fila no trae, deduplicar teléfonos repetidos,
// decidir cuándo tocar las variables personalizadas -- y duplicarlas era
// garantizar que se separaran con el tiempo.
export type ResultadoImportacion = {
  importados: number;
  actualizados: number;
  omitidos: { fila: number; motivo: string }[];
  columnasIgnoradas: string[];
  idsPorTelefono: Map<string, string>;
  idsNuevos: string[];
};

export async function importarContactosDesdeFilas({
  admin,
  cuentaId,
  filasCrudas,
  pais,
  asignadoA,
  actualizarExistentes,
  canalOrigen,
}: {
  admin: AdminClient;
  cuentaId: string;
  filasCrudas: string[][];
  pais: PaisImportacion;
  asignadoA: string | null;
  actualizarExistentes: boolean;
  canalOrigen: string;
}): Promise<{ ok: false; error: string; status: number } | ({ ok: true } & ResultadoImportacion)> {
  if (filasCrudas.length < 2) {
    return { ok: false, error: "El archivo no tiene filas de datos", status: 400 };
  }

  const { data: campos } = await admin.from("campos_personalizados").select("*").eq("cuenta_id", cuentaId);
  const columnas = resolverColumnasCsv((campos as CampoPersonalizado[]) ?? []);
  const { porIndice, ignorados } = matchearEncabezados(filasCrudas[0], columnas);

  const filasProcesadas = filasCrudas.slice(1).map((fila, idx) => procesarFilaCsv(idx + 2, fila, porIndice, pais));
  const filasValidas = filasProcesadas.filter((f) => f.ok && f.telefono);
  const omitidos = filasProcesadas.filter((f) => !f.ok).map((f) => ({ fila: f.numeroFila, motivo: f.motivo ?? "Error desconocido" }));

  if (filasValidas.length === 0) {
    return { ok: true, importados: 0, actualizados: 0, omitidos, columnasIgnoradas: ignorados, idsPorTelefono: new Map(), idsNuevos: [] };
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
      canal_origen: canalOrigen,
      asignado_a: asignadoA,
      status: "activo",
    }));

    const { data: insertados, error: errorInsert } = await admin.from("contactos").insert(filasInsert).select("id, telefono");
    if (errorInsert) return { ok: false, error: errorInsert.message, status: 500 };
    for (const c of insertados ?? []) idsPorTelefono.set(c.telefono, c.id);
  }

  // Las actualizaciones van una por una a propósito: cada fila solo trae un
  // subconjunto de campos, y un upsert masivo con columnas distintas por
  // fila terminaría poniendo NULL a lo que una fila no traía -- se prefiere
  // más queries a arriesgar borrar datos de un contacto que ya existía.
  // "Nombre (WhatsApp)" (columna `nombre`) nunca aparece aquí -- ni con
  // actualizarExistentes activado se toca, se autocaptura solo del perfil de
  // WhatsApp cuando el contacto escribe.
  if (actualizarExistentes) {
    for (const [telefono, f] of actualizaciones) {
      const cambios: Record<string, unknown> = {};
      if (f.camposReales?.nombre_completo) cambios.nombre_completo = f.camposReales.nombre_completo;
      if (f.camposReales?.correo_electronico) cambios.correo_electronico = f.camposReales.correo_electronico;
      if (f.camposReales?.etiquetas?.length) cambios.etiquetas = f.camposReales.etiquetas;
      if (Object.keys(cambios).length === 0) continue;
      await admin.from("contactos").update(cambios).eq("id", idsPorTelefono.get(telefono)!);
    }
  }

  // Los valores de variables personalizadas (ej. fecha_visita, turno_visita)
  // de un contacto NUEVO siempre se guardan -- no hay nada que decidir
  // pisar. Para uno que YA existía, solo se actualizan si el usuario
  // confirmó que quería actualizar sus datos.
  const telefonosNuevos = new Set(nuevos.map(([telefono]) => telefono));
  const valoresPersonalizados = [...filaPorTelefono.entries()]
    .filter(([telefono]) => actualizarExistentes || telefonosNuevos.has(telefono))
    .flatMap(([telefono, f]) =>
      (f.valoresPersonalizados ?? []).map((v) => ({ contacto_id: idsPorTelefono.get(telefono)!, campo_id: v.campo_id, valor: v.valor })),
    );
  if (valoresPersonalizados.length > 0) {
    await admin.from("valores_campos_personalizados").upsert(valoresPersonalizados, { onConflict: "contacto_id,campo_id" });
  }

  return {
    ok: true,
    importados: nuevos.length,
    actualizados: actualizaciones.length,
    omitidos,
    columnasIgnoradas: ignorados,
    idsPorTelefono,
    idsNuevos: nuevos.map(([telefono]) => idsPorTelefono.get(telefono)!),
  };
}
