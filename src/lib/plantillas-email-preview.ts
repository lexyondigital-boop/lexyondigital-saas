// No se importa reemplazarVariablesEmail de src/lib/email-envio.ts a
// propósito: ese archivo trae nodemailer y el cliente admin de Supabase
// (server-only), y este helper lo usa un componente cliente ("use client")
// para la vista previa -- importarlo metería nodemailer al bundle del
// navegador. Se duplica el mismo one-liner aquí en vez de compartirlo.
function reemplazarVariables(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (match, clave) => valores[clave] ?? match);
}

// Valores de muestra para que la vista previa se vea "llena" -- nunca con
// {{...}} literales sin resolver -- sin depender de un contacto/cita real.
export const VALORES_EJEMPLO: Record<string, string> = {
  nombre: "Juan Pérez",
  correo_electronico: "juan.perez@correo.com",
  cita_fecha: "2026-09-15",
  cita_hora_inicio: "10:00",
  cita_hora_fin: "10:30",
  tipo_cita: "Consulta general",
  profesional_nombre: "Dra. Ana Martínez",
  profesional_logo: "https://placehold.co/150x50?text=Logo",
  profesional_color: "#6b2fa0",
  profesional_facebook: "https://facebook.com/tunegocio",
  profesional_instagram: "https://instagram.com/tunegocio",
  profesional_tiktok: "https://tiktok.com/@tunegocio",
};

export function renderizarPreview(html: string): string {
  return reemplazarVariables(html, VALORES_EJEMPLO);
}
