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
  correo: "Correo",
  integraciones: "Integraciones",
  agentes_voz: "Agentes de voz",
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
  assign_contact: "Asignó un contacto",
  load_campaign_contacts: "Cargó contactos a una campaña",
  disconnect_email: "Desconectó el correo de la cuenta",
  save_smtp_email: "Configuró el SMTP de la cuenta",
  create_plantilla_email: "Creó una plantilla de correo",
  edit_plantilla_email: "Editó una plantilla de correo",
  delete_plantilla_email: "Eliminó una plantilla de correo",
  connect_retell: "Conectó Retell AI",
  disconnect_retell: "Desconectó Retell AI",
  create_plantilla_voz: "Creó una plantilla de voz",
  edit_plantilla_voz: "Editó una plantilla de voz",
  delete_plantilla_voz: "Eliminó una plantilla de voz",
  duplicar_plantilla_voz: "Duplicó una plantilla de voz",
  publicar_plantilla_voz: "Publicó una plantilla de voz",
  despublicar_plantilla_voz: "Despublicó una plantilla de voz",
};

export function agruparPorCategoria(permisos: Permiso[]): Record<string, Permiso[]> {
  const grupos: Record<string, Permiso[]> = {};
  for (const p of permisos) {
    if (!grupos[p.categoria]) grupos[p.categoria] = [];
    grupos[p.categoria].push(p);
  }
  return grupos;
}
