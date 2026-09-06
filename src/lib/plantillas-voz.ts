// Catálogos compartidos entre Plantillas (lista de solo activar/desactivar)
// y Agentes de Voz (donde vive toda la configuración real).

export const AGENTES_TIPO_VOZ: { valor: string; etiqueta: string; disponible: boolean }[] = [
  { valor: "servicio", etiqueta: "Servicio", disponible: true },
  { valor: "citas", etiqueta: "Recordatorio de citas", disponible: false },
  { valor: "venta", etiqueta: "Venta", disponible: false },
  { valor: "cobranza", etiqueta: "Cobranza", disponible: false },
  { valor: "legal", etiqueta: "Legal", disponible: false },
];

export const CATEGORIAS_VOZ: { valor: string; etiqueta: string }[] = [
  { valor: "legal", etiqueta: "Legal" },
  { valor: "medicos", etiqueta: "Médicos" },
  { valor: "inmobiliario", etiqueta: "Inmobiliarios" },
  { valor: "servicios", etiqueta: "Servicios" },
  { valor: "cobranza", etiqueta: "Cobranza" },
  { valor: "ventas", etiqueta: "Ventas" },
];

export const IDIOMAS_VOZ: { valor: string; etiqueta: string }[] = [
  { valor: "es-419", etiqueta: "Español (Latinoamérica)" },
  { valor: "es-ES", etiqueta: "Español (España)" },
  { valor: "en-US", etiqueta: "Inglés (EE. UU.)" },
  { valor: "en-GB", etiqueta: "Inglés (Reino Unido)" },
  { valor: "pt-BR", etiqueta: "Portugués (Brasil)" },
  { valor: "fr-FR", etiqueta: "Francés" },
];
