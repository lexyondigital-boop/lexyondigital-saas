// Fuente única de verdad para las variables `{{clave}}` disponibles por
// tipo de plantilla -- usada tanto por el prompt de generación con IA
// (src/app/api/plantillas-email/generar/route.ts) como por los merge tags
// del editor visual (EditorVisualUnlayer.tsx), para que ambos ofrezcan
// exactamente las mismas variables.

export type TipoPlantillaEmail = "confirmacion_cita" | "reagendamiento_cita" | "cancelacion_cita" | "campana";

export type VariablePlantillaEmail = { clave: string; etiqueta: string };

const VARIABLES_CITA: VariablePlantillaEmail[] = [
  { clave: "nombre", etiqueta: "Nombre del contacto" },
  { clave: "correo_electronico", etiqueta: "Correo del contacto" },
  { clave: "cita_fecha", etiqueta: "Fecha de la cita" },
  { clave: "cita_hora_inicio", etiqueta: "Hora de inicio" },
  { clave: "cita_hora_fin", etiqueta: "Hora de fin" },
  { clave: "tipo_cita", etiqueta: "Tipo de cita" },
  { clave: "profesional_nombre", etiqueta: "Nombre del profesional" },
  { clave: "profesional_logo", etiqueta: "Logo del profesional" },
  { clave: "profesional_color", etiqueta: "Color de marca" },
  { clave: "profesional_facebook", etiqueta: "Facebook del profesional" },
  { clave: "profesional_instagram", etiqueta: "Instagram del profesional" },
  { clave: "profesional_tiktok", etiqueta: "TikTok del profesional" },
];

export const VARIABLES_POR_TIPO: Record<TipoPlantillaEmail, VariablePlantillaEmail[]> = {
  confirmacion_cita: VARIABLES_CITA,
  reagendamiento_cita: VARIABLES_CITA,
  cancelacion_cita: VARIABLES_CITA,
  campana: [
    { clave: "nombre", etiqueta: "Nombre del contacto" },
    { clave: "correo_electronico", etiqueta: "Correo del contacto" },
  ],
};

export function variablesPorTipo(tipo: string): VariablePlantillaEmail[] {
  return VARIABLES_POR_TIPO[tipo as TipoPlantillaEmail] ?? VARIABLES_POR_TIPO.campana;
}
