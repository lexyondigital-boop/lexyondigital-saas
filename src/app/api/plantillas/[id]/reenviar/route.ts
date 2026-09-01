import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";
import { crearPlantillaMeta } from "@/lib/meta-plantillas";
import { obtenerCredencialesWhatsappPorId } from "@/lib/whatsapp-credenciales";
import { construirComponents, type PayloadPlantilla } from "@/lib/plantilla-meta-payload";

// Reintenta someter a Meta una plantilla que quedó como borrador local (por
// un error temporal, o porque en su momento faltó el handle de un medio y ya
// se completó la subida). Usa lo que ya está guardado en la fila -- no se
// puede cambiar contenido aquí, para eso está el PATCH normal antes de
// reenviar.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermiso("edit_templates");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: fila } = await admin.from("templates").select("*").eq("id", id).eq("cuenta_id", auth.perfil.cuenta_id).maybeSingle();
  if (!fila) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  if (fila.status === "approved") {
    return NextResponse.json({ error: "Esta plantilla ya está aprobada" }, { status: 409 });
  }
  if (!fila.cuenta_whatsapp_id) {
    return NextResponse.json({ error: "Esta plantilla no tiene un número de WhatsApp asignado" }, { status: 400 });
  }

  const faltaMedioHeader = fila.header_tipo !== "ninguno" && fila.header_tipo !== "texto" && !fila.header_media_handle && !fila.usa_carrusel;
  const faltaMedioCarrusel = fila.usa_carrusel && (fila.tarjetas as PayloadPlantilla["tarjetas"]).some((t) => !t.media_handle);
  if (faltaMedioHeader || faltaMedioCarrusel) {
    return NextResponse.json({ error: "Falta subir el archivo del encabezado o de una tarjeta antes de reenviar" }, { status: 400 });
  }

  const credenciales = await obtenerCredencialesWhatsappPorId(admin, fila.cuenta_whatsapp_id, auth.perfil.cuenta_id);
  if (!credenciales?.wabaId) {
    return NextResponse.json({ error: "El número de WhatsApp de esta plantilla ya no tiene credenciales activas" }, { status: 400 });
  }

  const p: PayloadPlantilla = {
    nombre: fila.name,
    categoria: fila.categoria,
    idioma: fila.language,
    cuenta_whatsapp_id: fila.cuenta_whatsapp_id,
    body: fila.body ?? "",
    body_ejemplos: fila.variables ?? [],
    header_tipo: fila.header_tipo,
    header_texto: fila.header_texto,
    header_texto_ejemplo: null,
    header_media_url: fila.header_media_url,
    header_media_handle: fila.header_media_handle,
    footer_texto: fila.footer_texto,
    botones: fila.botones ?? [],
    usa_carrusel: fila.usa_carrusel,
    tarjetas: fila.tarjetas ?? [],
    webhook_url: fila.webhook_url,
    webhook_headers: fila.webhook_headers ?? {},
    etiquetas_envio: fila.etiquetas_envio ?? [],
    etapa_destino_id: fila.etapa_destino_id,
  };

  const resultado = await crearPlantillaMeta({
    wabaId: credenciales.wabaId,
    accessToken: credenciales.accessToken,
    nombre: p.nombre,
    categoria: p.categoria,
    idioma: p.idioma,
    components: construirComponents(p),
  });

  const { data: actualizada, error } = await admin
    .from("templates")
    .update({
      meta_template_id: resultado.ok ? resultado.metaTemplateId : fila.meta_template_id,
      status: resultado.ok ? (resultado.status?.toLowerCase() ?? "pending") : fila.status,
      error_meta: resultado.ok ? null : resultado.error,
      enviado_a_meta_en: resultado.ok ? new Date().toISOString() : fila.enviado_a_meta_en,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await registrarActividad({
    cuentaId: auth.perfil.cuenta_id,
    perfilId: auth.user.id,
    accion: "resubmit_template",
    recursoTipo: "template",
    recursoId: id,
    detalles: { ok: resultado.ok, error: resultado.error },
    request,
  });

  return NextResponse.json({ template: actualizada, meta_error: resultado.ok ? null : resultado.error });
}
