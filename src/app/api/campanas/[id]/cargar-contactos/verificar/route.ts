import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { resolverColumnasCsv, matchearEncabezados, procesarFilaCsv } from "@/lib/contactos-csv";
import type { PaisImportacion } from "@/lib/telefono-import";
import type { CampoPersonalizado } from "@/lib/campos-personalizados";

// Paso previo a cargar-contactos: solo lee el CSV y avisa cuántos de esos
// teléfonos ya existen en la cuenta, sin escribir nada -- así el usuario
// decide si quiere actualizar sus datos (ej. una nueva fecha de visita para
// alguien que ya había salido en una campaña anterior) antes de que la
// carga real lo haga.
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
  const { porIndice } = matchearEncabezados(filasCrudas[0], columnas);

  const filasProcesadas = filasCrudas.slice(1).map((fila, idx) => procesarFilaCsv(idx + 2, fila, porIndice, pais));
  const telefonos = [...new Set(filasProcesadas.filter((f) => f.ok && f.telefono).map((f) => f.telefono!))];

  if (telefonos.length === 0) {
    return NextResponse.json({ total: 0, existentes: 0 });
  }

  const { count } = await admin
    .from("contactos")
    .select("id", { count: "exact", head: true })
    .eq("cuenta_id", cuentaId)
    .in("telefono", telefonos);

  return NextResponse.json({ total: telefonos.length, existentes: count ?? 0 });
}
