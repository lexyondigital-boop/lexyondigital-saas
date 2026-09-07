import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";

// Equivalente al módulo de Reportes por-cuenta (src/lib/reportes.ts), pero
// para el dashboard de la cuenta administradora: aquí sí hace falta cruzar
// TODAS las cuentas, así que no encaja en el modelo de un `reporte` dueño
// de una sola cuenta_id -- por eso es un endpoint aparte, en vivo, sin
// guardar la definición.
const AGRUPACIONES = ["cuenta", "categoria", "plantilla", "fecha"] as const;
const METRICAS = ["llamadas", "minutos", "costo"] as const;
type Agrupacion = (typeof AGRUPACIONES)[number];
type Metrica = (typeof METRICAS)[number];

export async function GET(request: NextRequest) {
  const auth = await requirePermiso("view_agentes_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.perfil.rol !== "super_admin") {
    return NextResponse.json({ error: "Solo la cuenta administradora puede ver este reporte" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const agruparPor = (searchParams.get("agrupar_por") ?? "cuenta") as Agrupacion;
  const metrica = (searchParams.get("metrica") ?? "llamadas") as Metrica;
  const rangoDias = searchParams.get("rango_dias");

  if (!AGRUPACIONES.includes(agruparPor)) return NextResponse.json({ error: "Agrupación inválida" }, { status: 400 });
  if (!METRICAS.includes(metrica)) return NextResponse.json({ error: "Métrica inválida" }, { status: 400 });

  const admin = createAdminClient();

  let query = admin
    .from("llamadas_voz")
    .select("cuenta_id, duracion_segundos, costo_retell, created_at, plantilla:plantillas_voz(nombre, categoria)");
  if (rangoDias && rangoDias !== "todo") {
    const desde = new Date(Date.now() - Number(rangoDias) * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("created_at", desde);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filas = data ?? [];

  const cuentaIds = [...new Set(filas.map((f) => f.cuenta_id))];
  const { data: cuentas } =
    cuentaIds.length > 0 ? await admin.from("cuentas").select("id, nombre, codigo, slug").in("id", cuentaIds) : { data: [] };
  const cuentaPorId = new Map((cuentas ?? []).map((c) => [c.id, c]));

  const valorDe = (f: { duracion_segundos: number | null; costo_retell: number | null }) =>
    metrica === "minutos" ? (f.duracion_segundos ?? 0) / 60 : metrica === "costo" ? (f.costo_retell ?? 0) : 1;

  const mapa = new Map<string, number>();
  for (const f of filas) {
    const plantilla = f.plantilla as unknown as { nombre: string; categoria: string } | null;
    const cuenta = cuentaPorId.get(f.cuenta_id);
    const clave =
      agruparPor === "cuenta"
        ? cuenta
          ? `${cuenta.codigo ?? cuenta.nombre} · ${cuenta.slug ?? ""}`
          : "Sin cuenta"
        : agruparPor === "categoria"
          ? (plantilla?.categoria ?? "Sin categoría")
          : agruparPor === "plantilla"
            ? (plantilla?.nombre ?? "Sin plantilla")
            : f.created_at.slice(0, 10);
    mapa.set(clave, (mapa.get(clave) ?? 0) + valorDe(f));
  }

  const datos = [...mapa.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor }));
  const ordenado = agruparPor === "fecha" ? datos.sort((a, b) => a.etiqueta.localeCompare(b.etiqueta)) : datos.sort((a, b) => b.valor - a.valor);

  return NextResponse.json({ datos: ordenado });
}
