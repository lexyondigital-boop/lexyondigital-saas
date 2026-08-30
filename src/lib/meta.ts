const GRAPH_API_VERSION = "v21.0";

// Algunos países tienen diferencias entre el wa_id que llega en los webhooks
// y el número que la Graph API espera al enviar. Cada regla debe quedar
// VERIFICADA con una prueba real (mandar un mensaje, ver el wa_id entrante,
// probar el envío) antes de activarse — adivinar el formato de un país que no
// se ha probado puede romper el envío en silencio para un cliente real.
type ReglaNumeroPais = {
  pais: string;
  verificado: boolean;
  normalizar: (telefono: string) => string;
};

const REGLAS_NUMERO_POR_PAIS: ReglaNumeroPais[] = [
  {
    // Confirmado 2026-08-25 contra la Graph API: el wa_id trae "521" + 10
    // dígitos, pero enviar requiere "52" + los mismos 10 dígitos (sin el "1").
    // https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
    pais: "México (+52)",
    verificado: true,
    normalizar: (telefono) => (/^521\d{10}$/.test(telefono) ? `52${telefono.slice(3)}` : telefono),
  },
  // Argentina (+54) tiene una particularidad conocida con un "9" para
  // móviles, pero AÚN NO está verificada — no se adivina la regla aquí.
  // Antes de habilitarla: mandar un WhatsApp real desde un número argentino,
  // confirmar el wa_id exacto que llega al webhook, y probar el envío en los
  // formatos candidatos contra la Graph API (mismo método que con México)
  // antes de dar de alta el primer cliente de ese país.
];

export function normalizarDestinatario(telefono: string): string {
  for (const regla of REGLAS_NUMERO_POR_PAIS) {
    if (!regla.verificado) continue;
    const normalizado = regla.normalizar(telefono);
    if (normalizado !== telefono) return normalizado;
  }
  return telefono;
}

type ResultadoEnvio = {
  ok: boolean;
  whatsappMessageId: string | null;
  raw: unknown;
};

export async function enviarMensajeTexto({
  phoneNumberId,
  accessToken,
  to,
  texto,
}: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  texto: string;
}): Promise<ResultadoEnvio> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: texto },
      }),
    },
  );

  const data = await res.json();
  return {
    ok: res.ok && Array.isArray(data?.messages) && data.messages.length > 0,
    whatsappMessageId: data?.messages?.[0]?.id ?? null,
    raw: data,
  };
}

// El id de medio que llega en el webhook no es descargable directo -- primero
// hay que pedirle a Meta la URL temporal (expira en minutos) y descargarla
// con el mismo access_token en el header, o la CDN de Meta la rechaza.
export async function descargarMediaWhatsapp({
  mediaId,
  accessToken,
}: {
  mediaId: string;
  accessToken: string;
}): Promise<{ ok: boolean; datos: ArrayBuffer | null; mimeType: string | null; error: string | null }> {
  const resUrl = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const dataUrl = await resUrl.json();

  if (!resUrl.ok || !dataUrl?.url) {
    return { ok: false, datos: null, mimeType: null, error: dataUrl?.error?.message ?? "No se pudo obtener la URL del medio" };
  }

  const resArchivo = await fetch(dataUrl.url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resArchivo.ok) {
    return { ok: false, datos: null, mimeType: null, error: `Descarga del medio falló con status ${resArchivo.status}` };
  }

  return { ok: true, datos: await resArchivo.arrayBuffer(), mimeType: dataUrl.mime_type ?? null, error: null };
}

export async function consultarNumero({
  phoneNumberId,
  accessToken,
}: {
  phoneNumberId: string;
  accessToken: string;
}): Promise<{ ok: boolean; numero: string | null; nombreVerificado: string | null; error: string | null }> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  const data = await res.json();

  if (!res.ok) {
    return { ok: false, numero: null, nombreVerificado: null, error: data?.error?.message ?? "Error desconocido" };
  }

  return {
    ok: true,
    numero: data?.display_phone_number ?? null,
    nombreVerificado: data?.verified_name ?? null,
    error: null,
  };
}

export async function enviarMensajePlantilla({
  phoneNumberId,
  accessToken,
  to,
  nombrePlantilla,
  idioma,
  parametros,
}: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  nombrePlantilla: string;
  idioma: string;
  parametros: string[];
}): Promise<ResultadoEnvio> {
  const components =
    parametros.length > 0
      ? [{ type: "body", parameters: parametros.map((texto) => ({ type: "text", text: texto })) }]
      : [];

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: nombrePlantilla,
          language: { code: idioma },
          components,
        },
      }),
    },
  );

  const data = await res.json();
  return {
    ok: res.ok && Array.isArray(data?.messages) && data.messages.length > 0,
    whatsappMessageId: data?.messages?.[0]?.id ?? null,
    raw: data,
  };
}
