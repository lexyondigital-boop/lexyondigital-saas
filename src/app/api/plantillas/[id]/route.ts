import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";
import { eliminarPlantillaMeta } from "@/lib/meta-plantillas";
import { obtenerCredencialesWhatsappPorId } from "@/lib/whatsapp-credenciales";
import { CAMPOS_CONTENIDO_META, type PayloadPlantilla } from "@/lib/plantilla-meta-payload";

// Traduce las llaves del payload del asistente (nombre/idioma/body_ejemplos)
// a las columnas reales de la tabla `templates`.
const COLUMNA_POR_CAMPO: Record<string, string> = {
  nombre: "name",
  categoria: "categoria",
  idioma: "language",
  cuenta_whatsapp_id: "cuenta_whatsapp_id",
  body: "body",
  body_ejemplos: "variables",
  variables_mapeo: "variables_mapeo",
  header_tipo: "header_tipo",
  header_texto: "header_texto",
  header_texto_ejemplo: "header_texto_ejemplo",
  header_variable_clave: "header_variable_clave",
  header_media_url: "header_media_url",
  header_media_handle: "header_media_handle",
  footer_texto: "footer_texto",
  botones: "botones",
  usa_carrusel: "usa_carrusel",
  tarjetas: "tarjetas",
  webhook_url: "webhook_url",
  webhook_headers: "webhook_headers",
  etiquetas_envio: "etiquetas_envio",
  etapa_destino_id: "etapa_destino_id",
};

// Campos de configuración de la plataforma (no forman parte del contenido
// sometido a Meta) -- siempre editables sin importar el status de la
// plantilla en Meta.
const CAMPOS_LOCALES = ["webhook_url", "webhook_headers", "etiquetas_envio", "etapa_destino_id"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("edit_templates");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const cambios = (await request.json()) as Partial<PayloadPlantilla>;
  const admin = createAdminClient();

  const { data: existente } = await admin.from("templates").select("status").eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id).maybeSingle();
  if (!existente) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const camposContenidoEnviados = Object.keys(cambios).filter((k) => (CAMPOS_CONTENIDO_META as readonly string[]).includes(k));
  if (camposContenidoEnviados.length > 0 && existente.status === "approved") {
    return NextResponse.json(
      { error: "Esta plantilla ya fue aprobada por Meta -- para cambiar su contenido crea una nueva plantilla" },
      { status: 409 },
    );
  }

  const update: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(cambios)) {
    const columna = COLUMNA_POR_CAMPO[campo];
    if (columna) update[columna] = valor;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { data: fila, error } = await admin
    .from("templates")
    .update(update)
    .eq("id", id)
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const esSoloConfiguracionLocal = camposContenidoEnviados.length === 0 && Object.keys(cambios).every((k) => CAMPOS_LOCALES.includes(k));
  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "edit_template",
    recursoTipo: "template",
    recursoId: id,
    detalles: { campos: Object.keys(cambios), solo_configuracion_local: esSoloConfiguracionLocal },
    request,
  });

  return NextResponse.json({ template: fila });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("delete_templates");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: plantilla } = await admin
    .from("templates")
    .select("name, meta_template_id, cuenta_whatsapp_id")
    .eq("id", id)
    .eq("cuenta_id", auth.perfil.cuenta_id)
    .maybeSingle();

  if (!plantilla) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  // Best-effort: si ya se sometió a Meta, se intenta borrar allá también
  // para no dejarla viva de ese lado. Si falla (ya no existe, permisos, red),
  // se continúa igual con el borrado local -- no tiene caso bloquear al
  // usuario por un problema del lado de Meta que no puede resolver aquí.
  if (plantilla.meta_template_id && plantilla.cuenta_whatsapp_id) {
    const credenciales = await obtenerCredencialesWhatsappPorId(admin, plantilla.cuenta_whatsapp_id, auth.perfil.cuenta_id);
    if (credenciales?.wabaId) {
      const resultado = await eliminarPlantillaMeta({ wabaId: credenciales.wabaId, accessToken: credenciales.accessToken, nombre: plantilla.name });
      if (!resultado.ok) {
        console.error(`Cuenta ${auth.perfil.cuenta_id}: no se pudo eliminar la plantilla "${plantilla.name}" en Meta:`, resultado.error);
      }
    }
  }

  const { error } = await admin.from("templates").delete().eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "delete_template",
    recursoTipo: "template",
    recursoId: id,
    detalles: { nombre: plantilla.name },
    request,
  });

  return NextResponse.json({ ok: true });
}
