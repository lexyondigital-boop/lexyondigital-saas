import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { descifrar } from "@/lib/cifrado";
import { generarRespuestaIA, calcularCostoUsd, type ProveedorIA } from "@/lib/ia";
import { resolverLlaveDePlataforma } from "@/lib/plataforma-secretos";

const VARIABLES_POR_TIPO: Record<string, string[]> = {
  confirmacion_cita: [
    "nombre", "correo_electronico", "cita_fecha", "cita_hora_inicio", "cita_hora_fin", "tipo_cita",
    "profesional_nombre", "profesional_logo", "profesional_color", "profesional_facebook", "profesional_instagram", "profesional_tiktok",
  ],
  reagendamiento_cita: [
    "nombre", "correo_electronico", "cita_fecha", "cita_hora_inicio", "cita_hora_fin", "tipo_cita",
    "profesional_nombre", "profesional_logo", "profesional_color", "profesional_facebook", "profesional_instagram", "profesional_tiktok",
  ],
  cancelacion_cita: [
    "nombre", "correo_electronico", "cita_fecha", "cita_hora_inicio", "cita_hora_fin", "tipo_cita",
    "profesional_nombre", "profesional_logo", "profesional_color", "profesional_facebook", "profesional_instagram", "profesional_tiktok",
  ],
  campana: ["nombre", "correo_electronico"],
};

const NOMBRE_ACCION_POR_TIPO: Record<string, string> = {
  confirmacion_cita: "confirmar que una cita quedó agendada",
  reagendamiento_cita: "avisar que una cita fue reagendada a una nueva fecha/hora",
  cancelacion_cita: "avisar que una cita fue cancelada",
  campana: "una campaña de correo de remarketing/marketing",
};

function construirMetaPromptPlantillaEmail(tipo: string, descripcion: string): string {
  const variables = VARIABLES_POR_TIPO[tipo] ?? VARIABLES_POR_TIPO.campana;
  const lineasVariables = variables.map((v) => `{{${v}}}`).join(", ");
  const accion = NOMBRE_ACCION_POR_TIPO[tipo] ?? NOMBRE_ACCION_POR_TIPO.campana;

  return `Eres un experto en diseñar plantillas de correo HTML para negocios (clínicas, despachos, inmobiliarias). Vas a redactar el asunto y el cuerpo HTML de una plantilla cuyo propósito es: ${accion}.

REGLAS QUE DEBES SEGUIR SIEMPRE:
- Responde ÚNICAMENTE en este formato exacto, sin nada antes ni después:
ASUNTO: <el asunto del correo, una sola línea>
===CUERPO===
<el HTML completo del cuerpo del correo>
- El HTML debe ser autocontenido (estilos en línea o en un <style> dentro del propio bloque), pensado para clientes de correo (evita layouts complejos con CSS moderno que Outlook no soporta -- usa tablas o divs simples con estilos en línea).
- Puedes usar EXACTAMENTE estos marcadores de variable donde tenga sentido (no inventes otros, no cambies el texto entre llaves): ${lineasVariables}.
- Si el marcador es una imagen (ej. {{profesional_logo}}) o un enlace (ej. {{profesional_facebook}}), úsalo como el valor de un atributo src/href de una etiqueta <img>/<a>, no como texto plano.
- No inventes datos del negocio (precios, direcciones, políticas) que no te haya dado el usuario en su descripción.
- Responde en español, tono profesional y cercano salvo que la descripción del usuario pida otra cosa.`;
}

function parsearRespuesta(texto: string): { asunto: string; cuerpo_html: string } | null {
  const marcador = "===CUERPO===";
  const idx = texto.indexOf(marcador);
  if (idx === -1) return null;

  const encabezado = texto.slice(0, idx).trim();
  const cuerpo = texto.slice(idx + marcador.length).trim();
  const match = encabezado.match(/ASUNTO:\s*(.+)/i);
  if (!match || !cuerpo) return null;

  return { asunto: match[1].trim(), cuerpo_html: cuerpo };
}

export async function POST(request: NextRequest) {
  const auth = await requirePermiso("manage_email");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { tipo, descripcion } = (await request.json()) as { tipo?: string; descripcion?: string };
  if (!tipo || !descripcion?.trim()) {
    return NextResponse.json({ error: "Falta el tipo de plantilla o la descripción" }, { status: 400 });
  }

  const admin = createAdminClient();
  const cuentaId = auth.perfil.cuenta_id;

  const { data: config } = await admin
    .from("agente_config")
    .select("proveedor_ia, modo_api, api_key_usuario_cifrada")
    .eq("cuenta_id", cuentaId)
    .maybeSingle();

  const proveedor = (config?.proveedor_ia ?? "openai") as ProveedorIA;

  let apiKey: string | null = null;
  if (config?.modo_api === "user_key") {
    if (!config.api_key_usuario_cifrada) {
      return NextResponse.json({ error: "Primero guarda tu API key en Agente IA." }, { status: 400 });
    }
    apiKey = descifrar(config.api_key_usuario_cifrada);
  } else {
    apiKey = await resolverLlaveDePlataforma(admin, proveedor);
    if (!apiKey) {
      return NextResponse.json({ error: `Falta configurar la API key de plataforma para ${proveedor}.` }, { status: 500 });
    }
  }

  const resultado = await generarRespuestaIA({
    proveedor,
    apiKey,
    systemPrompt: construirMetaPromptPlantillaEmail(tipo, descripcion),
    historial: [],
    mensajeNuevo: descripcion.trim(),
  });

  if (!resultado.ok || !resultado.texto) {
    return NextResponse.json({ error: resultado.error ?? "No se pudo generar la plantilla" }, { status: 502 });
  }

  const parseado = parsearRespuesta(resultado.texto);
  if (!parseado) {
    return NextResponse.json({ error: "La IA no devolvió el formato esperado, intenta de nuevo." }, { status: 502 });
  }

  const costoUsd = calcularCostoUsd(proveedor, resultado.tokensEntrada, resultado.tokensSalida);

  await admin.from("agente_uso_ia").insert({
    cuenta_id: cuentaId,
    proveedor,
    modalidad: "asistente_plantilla_email",
    tokens_entrada: resultado.tokensEntrada,
    tokens_salida: resultado.tokensSalida,
    tokens_total: resultado.tokensEntrada + resultado.tokensSalida,
    costo_usd: costoUsd,
  });

  return NextResponse.json({ asunto: parseado.asunto, cuerpo_html: parseado.cuerpo_html, costo_usd: costoUsd });
}
