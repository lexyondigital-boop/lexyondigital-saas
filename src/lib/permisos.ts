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
};

export function agruparPorCategoria(permisos: Permiso[]): Record<string, Permiso[]> {
  const grupos: Record<string, Permiso[]> = {};
  for (const p of permisos) {
    if (!grupos[p.categoria]) grupos[p.categoria] = [];
    grupos[p.categoria].push(p);
  }
  return grupos;
}
