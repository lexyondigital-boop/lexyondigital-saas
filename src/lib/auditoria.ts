import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Siempre escribe con el cliente admin (service_role) -- logs_actividad e
// historial_permisos no tienen policy de insert para el cliente normal a
// propósito, así ningún usuario puede falsificar su propio registro de
// auditoría desde el navegador.
export async function registrarActividad({
  cuentaId,
  perfilId,
  accion,
  recursoTipo,
  recursoId,
  detalles,
  request,
}: {
  cuentaId: string;
  perfilId: string | null;
  accion: string;
  recursoTipo?: string;
  recursoId?: string;
  detalles?: Record<string, unknown>;
  request?: NextRequest;
}) {
  const admin = createAdminClient();

  await admin.from("logs_actividad").insert({
    cuenta_id: cuentaId,
    perfil_id: perfilId,
    accion,
    recurso_tipo: recursoTipo ?? null,
    recurso_id: recursoId ?? null,
    detalles: detalles ?? {},
    ip_address: request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: request?.headers.get("user-agent") ?? null,
  });
}

export async function registrarCambioPermiso({
  cuentaId,
  perfilId,
  cambiadoPor,
  permisoClave,
  valorAnterior,
  valorNuevo,
  tipoCambio,
  razon,
}: {
  cuentaId: string;
  perfilId: string;
  cambiadoPor: string;
  permisoClave: string;
  valorAnterior: boolean | null;
  valorNuevo: boolean | null;
  tipoCambio: "concedido" | "revocado" | "cambio_rol";
  razon?: string;
}) {
  const admin = createAdminClient();

  await admin.from("historial_permisos").insert({
    cuenta_id: cuentaId,
    perfil_id: perfilId,
    cambiado_por: cambiadoPor,
    permiso_clave: permisoClave,
    valor_anterior: valorAnterior,
    valor_nuevo: valorNuevo,
    tipo_cambio: tipoCambio,
    razon: razon ?? null,
  });
}
