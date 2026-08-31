import { NextRequest, NextResponse } from "next/server";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";

// El comentario ES la fila de auditoría (accion: "comment_deal") -- no hay
// una tabla de comentarios aparte, así el timeline completo del deal vive en
// un solo lugar (logs_actividad), ver /timeline/route.ts.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("manage_deals");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { texto } = (await request.json()) as { texto?: string };

  if (!texto?.trim()) {
    return NextResponse.json({ error: "El comentario no puede estar vacío" }, { status: 400 });
  }

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "comment_deal",
    recursoTipo: "deal",
    recursoId: id,
    detalles: { texto: texto.trim() },
    request,
  });

  return NextResponse.json({ ok: true });
}
