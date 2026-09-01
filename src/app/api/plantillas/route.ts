import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { registrarActividad } from "@/lib/auditoria";
import { crearPlantillaMeta } from "@/lib/meta-plantillas";
import { obtenerCredencialesWhatsappPorId } from "@/lib/whatsapp-credenciales";
import { construirComponents, validarPlantilla, type PayloadPlantilla } from "@/lib/plantilla-meta-payload";

export async function POST(request: NextRequest) {
  const auth = await requirePermiso("create_templates");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json()) as Partial<PayloadPlantilla>;
  const errorValidacion = validarPlantilla(body);
  if (errorValidacion) return NextResponse.json({ error: errorValidacion }, { status: 400 });

  const p: PayloadPlantilla = {
    nombre: body.nombre!.trim(),
    categoria: body.categoria!,
    idioma: body.idioma!.trim(),
    cuenta_whatsapp_id: body.cuenta_whatsapp_id!,
    body: body.body!.trim(),
    body_ejemplos: body.body_ejemplos ?? [],
    variables_mapeo: body.variables_mapeo ?? [],
    header_tipo: body.header_tipo ?? "ninguno",
    header_media_url: body.header_media_url ?? null,
    header_media_handle: body.header_media_handle ?? null,
    footer_texto: body.footer_texto ?? null,
    botones: body.botones ?? [],
    usa_carrusel: body.usa_carrusel ?? false,
    tarjetas: body.tarjetas ?? [],
    webhook_url: body.webhook_url ?? null,
    webhook_headers: body.webhook_headers ?? {},
    etiquetas_envio: body.etiquetas_envio ?? [],
    etapa_destino_id: body.etapa_destino_id ?? null,
  };

  const admin = createAdminClient();
  const cuentaId = auth.perfil.cuenta_id;

  const credenciales = await obtenerCredencialesWhatsappPorId(admin, p.cuenta_whatsapp_id, cuentaId);
  if (!credenciales) {
    return NextResponse.json({ error: "El número de WhatsApp elegido no tiene credenciales activas" }, { status: 400 });
  }
  if (!credenciales.wabaId) {
    return NextResponse.json({ error: "Ese número no tiene un WABA ID configurado -- revisa la conexión en Configuración" }, { status: 400 });
  }

  // Si falta un handle de medio requerido, se guarda como borrador local sin
  // intentar el POST a Meta -- nunca se pierde lo capturado, y el usuario
  // puede reintentar la subida del archivo y reenviar después.
  const faltaMedioHeader = p.header_tipo !== "ninguno" && !p.header_media_handle && !p.usa_carrusel;
  const faltaMedioCarrusel = p.usa_carrusel && p.tarjetas.some((t) => !t.media_handle);
  const listaParaMeta = !faltaMedioHeader && !faltaMedioCarrusel;

  let metaTemplateId: string | null = null;
  let status = "pending";
  let errorMeta: string | null = faltaMedioHeader
    ? "Falta el archivo del encabezado -- vuelve a intentar la subida"
    : faltaMedioCarrusel
      ? "Falta el archivo de una o más tarjetas del carrusel -- vuelve a intentar la subida"
      : null;
  let enviadoAMetaEn: string | null = null;

  if (listaParaMeta) {
    const components = construirComponents(p);
    const resultado = await crearPlantillaMeta({
      wabaId: credenciales.wabaId,
      accessToken: credenciales.accessToken,
      nombre: p.nombre,
      categoria: p.categoria,
      idioma: p.idioma,
      components,
    });

    if (resultado.ok) {
      metaTemplateId = resultado.metaTemplateId;
      status = resultado.status?.toLowerCase() ?? "pending";
      enviadoAMetaEn = new Date().toISOString();
    } else {
      errorMeta = resultado.error;
    }
  }

  const { data: fila, error: errorInsert } = await admin
    .from("templates")
    .insert({
      cuenta_id: cuentaId,
      name: p.nombre,
      language: p.idioma,
      status,
      body: p.body,
      variables: p.body_ejemplos,
      variables_mapeo: p.variables_mapeo,
      categoria: p.categoria,
      cuenta_whatsapp_id: p.cuenta_whatsapp_id,
      header_tipo: p.header_tipo,
      header_media_url: p.header_media_url,
      header_media_handle: p.header_media_handle,
      footer_texto: p.footer_texto,
      botones: p.botones,
      usa_carrusel: p.usa_carrusel,
      tarjetas: p.tarjetas,
      webhook_url: p.webhook_url,
      webhook_headers: p.webhook_headers,
      etiquetas_envio: p.etiquetas_envio,
      etapa_destino_id: p.etapa_destino_id,
      meta_template_id: metaTemplateId,
      error_meta: errorMeta,
      enviado_a_meta_en: enviadoAMetaEn,
    })
    .select()
    .single();

  if (errorInsert) {
    return NextResponse.json({ error: errorInsert.message }, { status: 500 });
  }

  await registrarActividad({
    cuentaId,
    perfilId: auth.user.id,
    accion: "create_template",
    recursoTipo: "template",
    recursoId: fila.id,
    detalles: { nombre: p.nombre, categoria: p.categoria, sometida_a_meta: listaParaMeta && !errorMeta },
    request,
  });

  return NextResponse.json({ template: fila, meta_error: errorMeta });
}
