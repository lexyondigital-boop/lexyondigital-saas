import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermiso } from "@/lib/require-permiso";
import { descifrar } from "@/lib/cifrado";
import { generarRespuestaIA, calcularCostoUsd, type ProveedorIA } from "@/lib/ia";
import { resolverLlaveDePlataforma } from "@/lib/plataforma-secretos";

const ETIQUETA_CATEGORIA: Record<string, string> = {
  legal: "un despacho legal",
  medicos: "un consultorio o clínica médica",
  inmobiliario: "una inmobiliaria",
  servicios: "un negocio de servicios",
  cobranza: "cobranza",
  ventas: "ventas",
};

function construirMetaPromptCopyscript(categoria: string, objetivo: string | undefined): string {
  const rubro = ETIQUETA_CATEGORIA[categoria] ?? "un negocio";

  return `Eres un experto en diseñar el comportamiento de agentes de voz con IA (Retell) que llaman por teléfono a clientes de ${rubro}.

Tu única tarea: redactar el "Copyscript" -- las instrucciones que va a seguir el agente de voz durante la llamada en tiempo real. Esto NO es un diálogo literal que alguien lea palabra por palabra: es el prompt de un LLM que conversa de forma natural, así que debe ser un conjunto de instrucciones claras, no un guion de teatro.

REGLAS QUE DEBES SEGUIR SIEMPRE:
- Devuelve ÚNICAMENTE el texto final del Copyscript, en español, sin explicaciones tuyas, sin markdown ni comillas envolviéndolo.
- Escríbelo en primera persona, como instrucciones que el agente lee de sí mismo (ej. "Eres el agente de voz de ...").
- Estructúralo en párrafos cortos por tema: cómo se presenta al iniciar la llamada, qué debe cubrir o preguntar durante la conversación, cómo maneja objeciones o dudas comunes, y cuándo/cómo debe cerrar o despedirse.
${objetivo ? `- El objetivo concreto de esta llamada es: "${objetivo}" -- toda la conversación debe estar orientada a lograrlo.` : ""}
- Como es una llamada de voz, indícale que sea breve por turno, hable de forma natural y espere a que el cliente responda antes de seguir -- nunca párrafos largos ni varias preguntas de golpe.
- No inventes políticas, precios ni datos del negocio que el administrador no te haya dado en su descripción -- si falta un dato específico, deja una instrucción genérica en vez de inventarlo.`;
}

export async function POST(request: NextRequest) {
  const auth = await requirePermiso("manage_plantillas_voz");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { categoria, objetivo, descripcion } = (await request.json()) as {
    categoria?: string;
    objetivo?: string;
    descripcion?: string;
  };

  if (!descripcion?.trim()) {
    return NextResponse.json({ error: "Falta describir qué debe hacer el agente en la llamada" }, { status: 400 });
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
    systemPrompt: construirMetaPromptCopyscript(categoria ?? "servicios", objetivo?.trim()),
    historial: [],
    mensajeNuevo: descripcion.trim(),
  });

  if (!resultado.ok || !resultado.texto) {
    return NextResponse.json({ error: resultado.error ?? "No se pudo generar el copyscript" }, { status: 502 });
  }

  const costoUsd = calcularCostoUsd(proveedor, resultado.tokensEntrada, resultado.tokensSalida);

  await admin.from("agente_uso_ia").insert({
    cuenta_id: cuentaId,
    proveedor,
    modalidad: "sugerir_copyscript",
    tokens_entrada: resultado.tokensEntrada,
    tokens_salida: resultado.tokensSalida,
    tokens_total: resultado.tokensEntrada + resultado.tokensSalida,
    costo_usd: costoUsd,
  });

  return NextResponse.json({ copyscript: resultado.texto, costo_usd: costoUsd });
}
