export type Boton = { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phone_number?: string };
export type Tarjeta = {
  media_tipo: "imagen" | "video";
  media_url: string;
  media_handle: string | null;
  body: string;
  body_ejemplos: string[];
  botones: Boton[];
};

export type PayloadPlantilla = {
  nombre: string;
  categoria: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  idioma: string;
  cuenta_whatsapp_id: string;
  body: string;
  body_ejemplos: string[];
  // Paralelo a body_ejemplos por posición: si un elemento tiene la clave_variable
  // de un campo personalizado, el envío de campañas autollena ese {{n}} con el
  // dato real del contacto en vez del ejemplo fijo (ver lib/variables-contacto.ts).
  variables_mapeo: (string | null)[];
  // Solo medio -- Meta no permite un header de texto junto con uno de medio,
  // así que el "título" se resuelve como la primera línea en negritas del
  // body (ver AsistentePlantillaModal), dejando Archivo siempre independiente.
  header_tipo: "ninguno" | "imagen" | "video" | "documento";
  header_media_url: string | null;
  header_media_handle: string | null;
  footer_texto: string | null;
  botones: Boton[];
  usa_carrusel: boolean;
  tarjetas: Tarjeta[];
  webhook_url: string | null;
  webhook_headers: Record<string, string>;
  etiquetas_envio: string[];
  etapa_destino_id: string | null;
};

const FORMATO_HEADER_META: Record<string, string> = { imagen: "IMAGE", video: "VIDEO", documento: "DOCUMENT" };

// Arma el arreglo `components` exacto que exige la Graph API a partir de los
// campos capturados en el asistente. Cuando usa_carrusel es true, Meta no
// admite encabezado/footer/botones a nivel plantilla -- solo el body y las
// tarjetas (ya lo advierte el propio asistente en la pestaña Tarjetas).
// Compartido entre la creación (src/app/api/plantillas/route.ts) y el
// reenvío (src/app/api/plantillas/[id]/reenviar/route.ts).
export function construirComponents(p: PayloadPlantilla): unknown[] {
  const components: unknown[] = [
    { type: "BODY", text: p.body, ...(p.body_ejemplos.length ? { example: { body_text: [p.body_ejemplos] } } : {}) },
  ];

  if (p.usa_carrusel) {
    components.push({
      type: "CAROUSEL",
      cards: p.tarjetas.map((t, i) => ({
        card_index: i,
        components: [
          { type: "HEADER", format: FORMATO_HEADER_META[t.media_tipo], example: { header_handle: [t.media_handle] } },
          { type: "BODY", text: t.body, ...(t.body_ejemplos.length ? { example: { body_text: [t.body_ejemplos] } } : {}) },
          ...(t.botones.length ? [{ type: "BUTTONS", buttons: t.botones }] : []),
        ],
      })),
    });
    return components;
  }

  if (p.header_tipo !== "ninguno" && p.header_media_handle) {
    components.push({ type: "HEADER", format: FORMATO_HEADER_META[p.header_tipo], example: { header_handle: [p.header_media_handle] } });
  }

  if (p.footer_texto) {
    components.push({ type: "FOOTER", text: p.footer_texto });
  }

  if (p.botones.length) {
    components.push({ type: "BUTTONS", buttons: p.botones });
  }

  return components;
}

export function validarPlantilla(p: Partial<PayloadPlantilla>): string | null {
  if (!p.nombre || !/^[a-z0-9_]+$/.test(p.nombre)) {
    return "El nombre debe ser solo minúsculas, números y guion bajo (ej. confirmacion_cita)";
  }
  if (!p.categoria || !["MARKETING", "UTILITY", "AUTHENTICATION"].includes(p.categoria)) {
    return "Categoría inválida";
  }
  if (!p.idioma?.trim()) return "Falta el idioma";
  if (!p.cuenta_whatsapp_id) return "Falta elegir el número de WhatsApp";
  if (!p.body?.trim()) return "Falta el cuerpo del mensaje";
  if (p.usa_carrusel) {
    if (!p.tarjetas || p.tarjetas.length < 2 || p.tarjetas.length > 10) return "El carrusel necesita entre 2 y 10 tarjetas";
    for (const t of p.tarjetas) {
      if (!t.body?.trim()) return "Todas las tarjetas necesitan un mensaje";
    }
  }
  return null;
}

// Campos que forman el contenido real de la plantilla en Meta -- una vez
// aprobada, Meta no permite editarlos in-place (hay que crear una nueva).
// Los demás (etiquetas de envío, etapa destino, webhook propio) son
// configuración solo de esta plataforma y siempre se pueden editar.
export const CAMPOS_CONTENIDO_META = [
  "nombre",
  "categoria",
  "idioma",
  "cuenta_whatsapp_id",
  "body",
  "body_ejemplos",
  "variables_mapeo",
  "header_tipo",
  "header_media_url",
  "header_media_handle",
  "footer_texto",
  "botones",
  "usa_carrusel",
  "tarjetas",
] as const;
