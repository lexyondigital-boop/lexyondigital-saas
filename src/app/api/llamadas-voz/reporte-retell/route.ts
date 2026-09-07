import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { resolverLlaveMaestraRetell, listarLlamadasRetell, type LlamadaRetell } from "@/lib/retell";
import { descifrar } from "@/lib/cifrado";

// Reporte "de verdad" de Retell, jalado en vivo -- junta la key maestra
// (todas las sub-cuentas en modo incluido) con la key propia de cada
// sub-cuenta que conectó su propia cuenta de Retell. Solo la cuenta
// administradora lo puede ver: cada key ajena que se descifra aquí es
// sensible, y las llamadas de otras cuentas no deben filtrarse a nadie más.
export async function GET() {
  const auth = await requirePermiso("view_agentes_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.perfil.rol !== "super_admin") {
    return NextResponse.json({ error: "Solo la cuenta administradora puede ver este reporte" }, { status: 403 });
  }

  const admin = createAdminClient();

  const llaveMaestra = await resolverLlaveMaestraRetell(admin);
  const { data: propias } = await admin
    .from("cuentas_retell")
    .select("api_key_cifrada")
    .eq("modo", "propia")
    .not("api_key_cifrada", "is", null);

  const keys = [
    ...(llaveMaestra ? [llaveMaestra] : []),
    ...((propias ?? []).map((r) => descifrar(r.api_key_cifrada as string))),
  ];

  const resultados = await Promise.all(keys.map((key) => listarLlamadasRetell(key, 100)));

  const porCallId = new Map<string, LlamadaRetell>();
  for (const r of resultados) {
    if (!r.ok) continue;
    for (const llamada of r.llamadas) porCallId.set(llamada.callId, llamada);
  }
  const llamadas = [...porCallId.values()];

  const cuentaIds = [...new Set(llamadas.map((l) => l.cuentaId).filter((v): v is string => !!v))];
  const { data: cuentas } =
    cuentaIds.length > 0 ? await admin.from("cuentas").select("id, nombre, codigo, slug").in("id", cuentaIds) : { data: [] };
  const cuentaPorId = new Map((cuentas ?? []).map((c) => [c.id, c]));

  const llamadasConCuenta = llamadas
    .map((l) => ({ ...l, cuenta: l.cuentaId ? cuentaPorId.get(l.cuentaId) ?? null : null }))
    .sort((a, b) => (b.startTimestamp ?? 0) - (a.startTimestamp ?? 0))
    .slice(0, 150);

  return NextResponse.json({ llamadas: llamadasConCuenta });
}
