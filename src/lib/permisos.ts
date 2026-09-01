export type Permiso = { clave: string; nombre: string; categoria: string };

export const LABEL_CATEGORIA: Record<string, string> = {
  contactos: "Contactos",
  conversaciones: "Conversaciones",
  plantillas: "Plantillas",
  campanas: "Campañas",
  agente_ia: "Agente IA",
  configuracion: "Configuración",
  analitica: "Estadísticas",
  usuarios: "Usuarios",
  equipos: "Equipos",
  profesionales: "Profesionales",
  citas: "Citas",
  etiquetas: "Etiquetas",
  variables: "Variables",
  pipeline: "Pipeline",
};

export const LABEL_ACCION: Record<string, string> = {
  login: "Inicio de sesión",
  logout: "Cierre de sesión",
  create_user: "Creó un usuario",
  edit_user: "Editó un usuario",
  deactivate_user: "Desactivó un usuario",
  create_team: "Creó un equipo",
  edit_team: "Editó un equipo",
  delete_team: "Eliminó un equipo",
  edit_professional: "Editó un profesional",
  create_appointment: "Agendó una cita",
  cancel_appointment: "Canceló una cita",
  disconnect_google_calendar: "Desconectó Google Calendar",
  resend_password_email: "Reenvió el correo de contraseña",
  reschedule_appointment: "Reagendó una cita",
  google_calendar_sync_inbound: "Google Calendar movió/canceló una cita",
  create_deal: "Creó un deal",
  edit_deal: "Editó un deal",
  move_deal_stage: "Movió un deal de etapa",
  assign_deal: "Asignó un deal",
  close_deal_won: "Cerró un deal como ganado",
  close_deal_lost: "Cerró un deal como perdido",
  delete_deal: "Eliminó un deal",
  comment_deal: "Comentó en un deal",
  create_etapa: "Creó una etapa del pipeline",
  edit_etapa: "Editó una etapa del pipeline",
  delete_etapa: "Eliminó una etapa del pipeline",
  create_task: "Creó una tarea",
  complete_task: "Completó una tarea",
  delete_task: "Eliminó una tarea",
  create_template: "Creó una plantilla",
  edit_template: "Editó una plantilla",
  delete_template: "Eliminó una plantilla",
  resubmit_template: "Reenvió una plantilla a Meta",
};

export function agruparPorCategoria(permisos: Permiso[]): Record<string, Permiso[]> {
  const grupos: Record<string, Permiso[]> = {};
  for (const p of permisos) {
    if (!grupos[p.categoria]) grupos[p.categoria] = [];
    grupos[p.categoria].push(p);
  }
  return grupos;
}
