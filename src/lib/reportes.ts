import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type EntidadReporte = "contactos" | "deals" | "campanas" | "conversaciones";
export type DimensionReporte =
  | "etapa_pipeline"
  | "etiqueta"
  | "asignado_a"
  | "canal_origen"
  | "status"
  | "campana_status"
  | "fecha_creacion"
  | "fecha_modificacion"
  | "campo_personalizado";
export type TipoGraficoReporte = "barras" | "dona" | "linea" | "numero";
export type AgruparFechaPor = "dia" | "semana" | "mes";

export type Reporte = {
  id: string;
  nombre: string;
  entidad: EntidadReporte;
  dimension: DimensionReporte;
  campo_personalizado_id: string | null;
  tipo_grafico: TipoGraficoReporte;
  agrupar_fecha_por: AgruparFechaPor | null;
  filtros: { rango_dias?: number | null; etiqueta?: string | null };
};

export type PuntoDato = { etiqueta: string; valor: number };

// Qué dimensiones tiene sentido pedir según la entidad -- se usa tanto
// para validar en la ruta POST/PATCH como para poblar el formulario.
// "campo_personalizado" aplica solo a contactos (los campos que el
// usuario define ahí); cuál campo exacto se elige aparte, vía
// campo_personalizado_id.
export const DIMENSIONES_POR_ENTIDAD: Record<EntidadReporte, DimensionReporte[]> = {
  contactos: ["etiqueta", "asignado_a", "canal_origen", "status", "campana_status", "fecha_creacion", "fecha_modificacion", "campo_personalizado"],
  deals: ["etapa_pipeline", "asignado_a", "status", "fecha_creacion", "fecha_modificacion"],
  campanas: ["status", "fecha_creacion", "fecha_modificacion"],
  conversaciones: ["status", "fecha_creacion"],
};

// Un campo de texto libre, correo o teléfono produciría una barra por
// contacto -- no sirve para agrupar. Select/checkbox/fecha sí.
export const TIPOS_CAMPO_REPORTABLES = ["select", "checkbox", "date"] as const;

type FilaGenerica = { claves: string[]; fecha: string };

function truncarFecha(fecha: string, por: AgruparFechaPor): string {
  const d = new Date(fecha);
  if (por === "mes") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  if (por === "semana") {
    const diaSemana = d.getDay() || 7;
    d.setDate(d.getDate() - diaSemana + 1);
  }
  return d.toISOString().slice(0, 10);
}

function agruparCategorico(filas: FilaGenerica[]): PuntoDato[] {
  const mapa = new Map<string, number>();
  for (const f of filas) {
    for (const clave of f.claves.length > 0 ? f.claves : ["Sin dato"]) {
      mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
    }
  }
  return [...mapa.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor })).sort((a, b) => b.valor - a.valor);
}

function agruparPorFecha(filas: FilaGenerica[], por: AgruparFechaPor): PuntoDato[] {
  const mapa = new Map<string, number>();
  for (const f of filas) {
    const clave = truncarFecha(f.fecha, por);
    mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
  }
  return [...mapa.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor })).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
}

// Trae las filas crudas de la entidad (sin vistas/RPC nuevas, mismo estilo
// que ya usa el resto de la app) y las reduce en JS según la dimensión
// elegida -- devuelve algo que cualquier chart de recharts puede consumir
// directo.
export async function calcularDatosReporte(admin: AdminClient, cuentaId: string, reporte: Reporte): Promise<PuntoDato[]> {
  const columnaFecha = reporte.dimension === "fecha_modificacion" ? "updated_at" : "created_at";
  const rangoDias = reporte.filtros?.rango_dias;
  const desde = rangoDias ? new Date(Date.now() - rangoDias * 24 * 60 * 60 * 1000).toISOString() : null;

  const [nombresEtapa, nombresPerfil] = await Promise.all([
    reporte.dimension === "etapa_pipeline"
      ? admin.from("etapas_pipeline").select("id, nombre").eq("cuenta_id", cuentaId).then(({ data }) => new Map((data ?? []).map((e) => [e.id, e.nombre])))
      : Promise.resolve(new Map<string, string>()),
    reporte.dimension === "asignado_a"
      ? admin.from("perfiles").select("id, nombre").eq("cuenta_id", cuentaId).then(({ data }) => new Map((data ?? []).map((p) => [p.id, p.nombre])))
      : Promise.resolve(new Map<string, string>()),
  ]);

  if (reporte.entidad === "contactos") {
    let query = admin
      .from("contactos")
      .select("id, etiquetas, asignado_a, canal_origen, status, campana_status, created_at, updated_at")
      .eq("cuenta_id", cuentaId);
    if (desde) query = query.gte(columnaFecha, desde);
    if (reporte.filtros?.etiqueta) query = query.contains("etiquetas", [reporte.filtros.etiqueta]);
    const { data } = await query;
    const contactos = data ?? [];

    if (reporte.dimension === "campo_personalizado" && reporte.campo_personalizado_id) {
      const [{ data: campo }, { data: valores }] = await Promise.all([
        admin.from("campos_personalizados").select("tipo").eq("id", reporte.campo_personalizado_id).maybeSingle(),
        admin
          .from("valores_campos_personalizados")
          .select("contacto_id, valor")
          .eq("campo_id", reporte.campo_personalizado_id)
          .in("contacto_id", contactos.length > 0 ? contactos.map((c) => c.id) : [""]),
      ]);

      if (reporte.tipo_grafico === "numero") return [{ etiqueta: "Total", valor: contactos.length }];

      const valorPorContacto = new Map((valores ?? []).map((v) => [v.contacto_id, v.valor]));

      // Un campo de tipo fecha se bucketiza por SU valor (no por
      // created_at) -- "agrupar por mes" tiene que reflejar la fecha que
      // el usuario capturó en ese campo.
      if (campo?.tipo === "date") {
        const filasFecha = contactos
          .map((c) => valorPorContacto.get(c.id))
          .filter((v): v is string => !!v)
          .map((fecha) => ({ claves: [], fecha }));
        return agruparPorFecha(filasFecha, reporte.agrupar_fecha_por ?? "dia");
      }

      return agruparCategorico(contactos.map((c) => ({ claves: [valorPorContacto.get(c.id) ?? "Sin dato"], fecha: c[columnaFecha as "created_at" | "updated_at"] })));
    }

    const filas: FilaGenerica[] = contactos.map((f) => ({
      fecha: f[columnaFecha as "created_at" | "updated_at"],
      claves:
        reporte.dimension === "etiqueta"
          ? f.etiquetas ?? []
          : reporte.dimension === "asignado_a"
            ? [f.asignado_a ? (nombresPerfil.get(f.asignado_a) ?? "Sin asignar") : "Sin asignar"]
            : reporte.dimension === "canal_origen"
              ? [f.canal_origen ?? "Sin canal"]
              : reporte.dimension === "status"
                ? [f.status ?? "Sin estado"]
                : reporte.dimension === "campana_status"
                  ? [f.campana_status ?? "Sin estado de campaña"]
                  : [],
    }));

    if (reporte.tipo_grafico === "numero") return [{ etiqueta: "Total", valor: contactos.length }];
    if (reporte.dimension === "fecha_creacion" || reporte.dimension === "fecha_modificacion") {
      return agruparPorFecha(filas, reporte.agrupar_fecha_por ?? "dia");
    }
    return agruparCategorico(filas);
  }

  if (reporte.entidad === "deals") {
    let query = admin.from("deals").select("etapa_id, propietario_id, estado, created_at, updated_at").eq("cuenta_id", cuentaId);
    if (desde) query = query.gte(columnaFecha, desde);
    const { data } = await query;
    const filas: FilaGenerica[] = (data ?? []).map((f) => ({
      fecha: f[columnaFecha as "created_at" | "updated_at"],
      claves:
        reporte.dimension === "etapa_pipeline"
          ? [f.etapa_id ? (nombresEtapa.get(f.etapa_id) ?? "Sin etapa") : "Sin etapa"]
          : reporte.dimension === "asignado_a"
            ? [f.propietario_id ? (nombresPerfil.get(f.propietario_id) ?? "Sin asignar") : "Sin asignar"]
            : reporte.dimension === "status"
              ? [f.estado ?? "Sin estado"]
              : [],
    }));

    if (reporte.tipo_grafico === "numero") return [{ etiqueta: "Total", valor: filas.length }];
    if (reporte.dimension === "fecha_creacion" || reporte.dimension === "fecha_modificacion") {
      return agruparPorFecha(filas, reporte.agrupar_fecha_por ?? "dia");
    }
    return agruparCategorico(filas);
  }

  if (reporte.entidad === "campanas") {
    let query = admin.from("campanas").select("status, created_at, updated_at").eq("cuenta_id", cuentaId);
    if (desde) query = query.gte(columnaFecha, desde);
    const { data } = await query;
    const filas: FilaGenerica[] = (data ?? []).map((f) => ({
      fecha: f[columnaFecha as "created_at" | "updated_at"],
      claves: reporte.dimension === "status" ? [f.status ?? "Sin estado"] : [],
    }));

    if (reporte.tipo_grafico === "numero") return [{ etiqueta: "Total", valor: filas.length }];
    if (reporte.dimension === "fecha_creacion" || reporte.dimension === "fecha_modificacion") {
      return agruparPorFecha(filas, reporte.agrupar_fecha_por ?? "dia");
    }
    return agruparCategorico(filas);
  }

  // conversaciones -- no tiene updated_at genérico, solo fecha_creacion.
  let query = admin.from("conversaciones").select("status, created_at").eq("cuenta_id", cuentaId);
  if (desde) query = query.gte("created_at", desde);
  const { data } = await query;
  const filas: FilaGenerica[] = (data ?? []).map((f) => ({
    fecha: f.created_at,
    claves: reporte.dimension === "status" ? [f.status === "abierta" ? "Abierta" : "Cerrada"] : [],
  }));

  if (reporte.tipo_grafico === "numero") return [{ etiqueta: "Total", valor: filas.length }];
  if (reporte.dimension === "fecha_creacion") return agruparPorFecha(filas, reporte.agrupar_fecha_por ?? "dia");
  return agruparCategorico(filas);
}
