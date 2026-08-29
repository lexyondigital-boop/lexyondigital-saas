// Formateo puro (sin acceso a base de datos) del bloque de agenda que se
// agrega al prompt del sistema. Vive aparte de agente-acciones.ts (que sí
// usa el cliente admin, server-only) para poder importarlo también desde la
// pantalla de Agente IA y mostrar ahí la vista previa exacta de lo que el
// modelo va a leer -- sin duplicar el texto a mano y arriesgarse a que se
// desalinee con lo que de verdad se manda al LLM.
export type ProfesionalParaPrompt = {
  id: string;
  nombre: string;
  especialidad: string;
  horario_inicio: string;
  horario_fin: string;
  dias_disponibles: string[];
  duracion_cita_minutos: number;
};

export function construirBloqueAgenda(profesionales: ProfesionalParaPrompt[]): string | null {
  if (profesionales.length === 0) return null;

  const lineas = profesionales.map(
    (p) =>
      `- id: ${p.id} | ${p.nombre} | ${p.especialidad} | días: ${(p.dias_disponibles ?? []).join(", ")} | horario: ${p.horario_inicio}-${p.horario_fin} | duración de cita: ${p.duracion_cita_minutos} min`,
  );

  return `PROFESIONALES DISPONIBLES (usa el "id" exacto en las herramientas, nunca lo inventes):\n${lineas.join("\n")}\n\nPara agendar, reagendar, cancelar o consultar horarios usa siempre las herramientas disponibles -- nunca inventes ni asumas disponibilidad, ids de citas o de profesionales.`;
}
