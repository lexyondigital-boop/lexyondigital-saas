// Tres plantillas de muestra, listas para usar como punto de partida al
// crear una plantilla de correo nueva. Redacción neutra respecto al tipo
// (no dicen "tu cita fue agendada/cancelada") para que sirvan igual de
// bien como base de una confirmación, un reagendamiento o una
// cancelación -- el usuario ajusta el texto según lo que necesite.
export type PlantillaEmailPredeterminada = {
  id: string;
  nombre: string;
  asunto: string;
  cuerpo_html: string;
};

export const PLANTILLAS_EMAIL_PREDETERMINADAS: PlantillaEmailPredeterminada[] = [
  {
    id: "minimalista",
    nombre: "Minimalista",
    asunto: "Detalles de tu cita",
    cuerpo_html: `<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:Georgia, 'Times New Roman', serif;color:#1a1a1a;">
  <p style="font-size:14px;letter-spacing:1px;text-transform:uppercase;color:#777;margin:0 0 24px;">Detalles de tu cita</p>
  <h1 style="font-size:22px;font-weight:normal;margin:0 0 16px;">Hola {{nombre}},</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">Aquí está la información de tu cita con {{profesional_nombre}}.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:8px 0;border-top:1px solid #e5e5e5;color:#777;">Fecha</td><td style="padding:8px 0;border-top:1px solid #e5e5e5;text-align:right;">{{cita_fecha}}</td></tr>
    <tr><td style="padding:8px 0;border-top:1px solid #e5e5e5;color:#777;">Hora</td><td style="padding:8px 0;border-top:1px solid #e5e5e5;text-align:right;">{{cita_hora_inicio}} - {{cita_hora_fin}}</td></tr>
    <tr><td style="padding:8px 0;border-top:1px solid #e5e5e5;border-bottom:1px solid #e5e5e5;color:#777;">Motivo</td><td style="padding:8px 0;border-top:1px solid #e5e5e5;border-bottom:1px solid #e5e5e5;text-align:right;">{{tipo_cita}}</td></tr>
  </table>
  <p style="font-size:13px;color:#999;margin:32px 0 0;">Si tienes alguna duda, contáctanos respondiendo este correo.</p>
</div>`,
  },
  {
    id: "corporativa",
    nombre: "Corporativa",
    asunto: "Información de tu cita",
    cuerpo_html: `<div style="max-width:560px;margin:0 auto;font-family:Arial, sans-serif;border:1px solid #eaeaea;border-radius:10px;overflow:hidden;">
  <div style="background-color:{{profesional_color}};padding:28px 24px;text-align:center;">
    <img src="{{profesional_logo}}" alt="Logo" style="max-height:48px;" />
  </div>
  <div style="padding:28px 24px;color:#1a1a1a;">
    <h2 style="font-size:19px;margin:0 0 12px;">Hola {{nombre}}</h2>
    <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 20px;">Estos son los detalles de tu cita con <strong>{{profesional_nombre}}</strong>:</p>
    <div style="background:#f7f7f9;border-radius:8px;padding:16px 20px;font-size:14px;color:#333;">
      <p style="margin:0 0 8px;"><strong>Fecha:</strong> {{cita_fecha}}</p>
      <p style="margin:0 0 8px;"><strong>Hora:</strong> {{cita_hora_inicio}} - {{cita_hora_fin}}</p>
      <p style="margin:0;"><strong>Motivo:</strong> {{tipo_cita}}</p>
    </div>
  </div>
  <div style="background:#fafafa;padding:16px 24px;text-align:center;font-size:12px;color:#999;">
    <a href="{{profesional_facebook}}" style="color:{{profesional_color}};text-decoration:none;margin:0 8px;">Facebook</a>
    <a href="{{profesional_instagram}}" style="color:{{profesional_color}};text-decoration:none;margin:0 8px;">Instagram</a>
    <a href="{{profesional_tiktok}}" style="color:{{profesional_color}};text-decoration:none;margin:0 8px;">TikTok</a>
  </div>
</div>`,
  },
  {
    id: "colorida",
    nombre: "Colorida / moderna",
    asunto: "¡Aquí están los detalles de tu cita!",
    cuerpo_html: `<div style="max-width:560px;margin:0 auto;font-family:'Trebuchet MS', Arial, sans-serif;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
  <div style="background-color:{{profesional_color}};padding:32px 24px;text-align:center;color:#ffffff;">
    <img src="{{profesional_logo}}" alt="Logo" style="max-height:52px;margin-bottom:12px;" />
    <h1 style="font-size:20px;margin:0;">¡Nos vemos pronto, {{nombre}}!</h1>
  </div>
  <div style="padding:24px;background:#ffffff;color:#222;">
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">Aquí tienes los detalles de tu cita con <strong>{{profesional_nombre}}</strong>:</p>
    <table style="width:100%;border-collapse:separate;border-spacing:0 8px;font-size:14px;">
      <tr><td style="background:#f2f0ff;border-radius:8px 0 0 8px;padding:10px 14px;color:#555;">📅 Fecha</td><td style="background:#f2f0ff;border-radius:0 8px 8px 0;padding:10px 14px;text-align:right;font-weight:bold;">{{cita_fecha}}</td></tr>
      <tr><td style="background:#f2f0ff;border-radius:8px 0 0 8px;padding:10px 14px;color:#555;">🕒 Hora</td><td style="background:#f2f0ff;border-radius:0 8px 8px 0;padding:10px 14px;text-align:right;font-weight:bold;">{{cita_hora_inicio}} - {{cita_hora_fin}}</td></tr>
      <tr><td style="background:#f2f0ff;border-radius:8px 0 0 8px;padding:10px 14px;color:#555;">📝 Motivo</td><td style="background:#f2f0ff;border-radius:0 8px 8px 0;padding:10px 14px;text-align:right;font-weight:bold;">{{tipo_cita}}</td></tr>
    </table>
  </div>
  <div style="background:#fafafa;padding:18px 24px;text-align:center;font-size:13px;">
    <p style="margin:0 0 8px;color:#777;">Síguenos:</p>
    <a href="{{profesional_facebook}}" style="color:{{profesional_color}};text-decoration:none;margin:0 10px;font-weight:bold;">Facebook</a>
    <a href="{{profesional_instagram}}" style="color:{{profesional_color}};text-decoration:none;margin:0 10px;font-weight:bold;">Instagram</a>
    <a href="{{profesional_tiktok}}" style="color:{{profesional_color}};text-decoration:none;margin:0 10px;font-weight:bold;">TikTok</a>
  </div>
</div>`,
  },
];
