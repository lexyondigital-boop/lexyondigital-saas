import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { descifrar } from "@/lib/cifrado";
import { generarRespuestaIA, calcularCostoUsd, type ProveedorIA } from "@/lib/ia";
import { listarProfesionalesParaPrompt } from "@/lib/agente-acciones";
import { slugificarClaveVariable, type CampoPersonalizado } from "@/lib/campos-personalizados";
import { resolverLlaveDePlataforma } from "@/lib/plataforma-secretos";

function construirMetaPrompt({
  tono,
  idioma,
  tieneAgenda,
  variablesExistentes,
  variablesNuevas,
}: {
  tono: string;
  idioma: string;
  tieneAgenda: boolean;
  variablesExistentes: { clave: string; etiqueta: string }[];
  variablesNuevas: { clave: string; etiqueta: string }[];
}): string {
  const lineasVariables = [...variablesExistentes, ...variablesNuevas].map((v) => `- {{${v.clave}}} — ${v.etiqueta}`);

  return `Eres un experto en diseñar prompts de sistema para agentes de IA que atienden clientes por WhatsApp dentro de un CRM.

Tu única tarea: redactar el prompt de sistema completo para ESE agente, en base a las respuestas que te va a dar el administrador del negocio a continuación (rubro del negocio, objetivo del agente, datos que debe capturar y reglas especiales).

REGLAS QUE DEBES SEGUIR SIEMPRE:
- Devuelve ÚNICAMENTE el texto final del prompt, en español, sin explicaciones tuyas, sin markdown, sin comillas ni bloques de código envolviéndolo.
- Escríbelo en primera persona, como si fueran instrucciones que el agente lee de sí mismo (ej. "Eres el agente virtual de recepción de ...").
- Estructúralo en párrafos cortos y claramente separados por tema (rol y objetivo; cómo debe conducir la conversación; qué no debe hacer o decir; cómo capturar datos). Cada regla debe ser una oración corta e imperativa por separado -- nunca mezcles varias reglas distintas en una misma oración larga, porque eso hace que el modelo que ejecuta el prompt olvide o ignore alguna.
- El tono debe ser ${tono} y debe responder en idioma "${idioma}".
- Los mensajes que el agente mande son de WhatsApp: indícale que sea breve y claro, nunca párrafos largos.
${
  lineasVariables.length > 0
    ? `- Para pedir y capturar datos del cliente, usa EXACTAMENTE estos marcadores (no inventes otros, no cambies el texto entre llaves):\n${lineasVariables.join("\n")}\n- Indícale al agente que pida estos datos de forma conversacional, uno a la vez, en un orden lógico según el flujo del negocio -- nunca los pida todos de golpe en una sola pregunta.`
    : "- Si el administrador pidió capturar algún dato del cliente pero no te di marcadores {{...}} para eso, NO inventes tu propio formato de marcador -- simplemente indícale al agente en texto normal qué debe preguntar."
}
${
  tieneAgenda
    ? "- Este agente SÍ tiene acceso a una agenda de citas (el sistema le agrega automáticamente, por separado, la lista de profesionales y las herramientas técnicas para consultar disponibilidad, agendar, reagendar y cancelar -- no las menciones ni las inventes tú). Limítate a indicar EN QUÉ MOMENTO de la conversación conviene ofrecer agendar una cita, y qué debe confirmar con el cliente antes de hacerlo (día, hora, motivo)."
    : "- Este agente NO tiene acceso a una agenda de citas todavía -- no le des instrucciones de agendar, reagendar ni cancelar citas."
}
- No inventes políticas, precios, ubicaciones ni datos del negocio que el administrador no te haya dado -- si falta información específica, deja una instrucción genérica y clara en vez de inventar un dato falso.
- No hace falta que redactes preguntas frecuentes ni qué hacer cuando el agente no sabe una respuesta -- eso el sistema lo agrega aparte de forma automática a partir de la sección "Preguntas frecuentes" de la cuenta, y no depende de este prompt. Enfócate solo en el rol, el objetivo, el flujo de conversación y las reglas propias de este negocio.
- No inventes información específica del negocio (servicios exactos, precios, horarios de atención, dirección, etc.) más allá de lo que el administrador te haya dado en esta conversación -- si subió documentos o conectó su sitio web en la sección "Documentos", el sistema se los agrega aparte al agente de forma automática, y no debes duplicar ni adivinar ese contenido aquí.`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase.from("perfiles").select("cuenta_id").eq("id", user.id).single();
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });

  const body = await request.json();
  const {
    rubro,
    objetivo,
    reglas,
    claves_variables_existentes,
    variables_nuevas,
  } = body as {
    rubro?: string;
    objetivo?: string;
    reglas?: string;
    claves_variables_existentes?: string[];
    variables_nuevas?: string[];
  };

  if (!rubro?.trim() || !objetivo?.trim()) {
    return NextResponse.json({ error: "Falta el rubro del negocio o el objetivo del agente" }, { status: 400 });
  }

  const admin = createAdminClient();
  const cuentaId = perfil.cuenta_id;

  const { data: config } = await admin
    .from("agente_config")
    .select("proveedor_ia, modo_api, api_key_usuario_cifrada, tono, idioma, profesionales_ids")
    .eq("cuenta_id", cuentaId)
    .maybeSingle();

  const proveedor = (config?.proveedor_ia ?? "openai") as ProveedorIA;
  const tono = config?.tono ?? "profesional";
  const idioma = config?.idioma ?? "es";

  let apiKey: string | null = null;
  if (config?.modo_api === "user_key") {
    if (!config.api_key_usuario_cifrada) {
      return NextResponse.json({ error: "Primero guarda tu API key en la sección de arriba." }, { status: 400 });
    }
    apiKey = descifrar(config.api_key_usuario_cifrada);
  } else {
    apiKey = await resolverLlaveDePlataforma(admin, proveedor);
    if (!apiKey) {
      return NextResponse.json({ error: `Falta configurar la API key de plataforma para ${proveedor}.` }, { status: 500 });
    }
  }

  const profesionalesTexto = await listarProfesionalesParaPrompt(cuentaId, config?.profesionales_ids ?? null);

  const { data: camposData } = await admin.from("campos_personalizados").select("*").eq("cuenta_id", cuentaId);
  const campos = (camposData ?? []) as CampoPersonalizado[];
  const clavesSeleccionadas = new Set(claves_variables_existentes ?? []);
  const variablesExistentes = campos
    .filter((c) => c.clave_variable && clavesSeleccionadas.has(c.clave_variable))
    .map((c) => ({ clave: c.clave_variable as string, etiqueta: c.nombre }));

  const clavesYaUsadas = new Set(campos.map((c) => c.clave_variable).filter(Boolean) as string[]);
  const variablesNuevas = (variables_nuevas ?? [])
    .map((e) => e.trim())
    .filter(Boolean)
    .map((etiqueta) => {
      let clave = slugificarClaveVariable(etiqueta);
      let sufijo = 2;
      while (!clave || clavesYaUsadas.has(clave)) {
        clave = `${slugificarClaveVariable(etiqueta)}_${sufijo}`;
        sufijo++;
      }
      clavesYaUsadas.add(clave);
      return { clave, etiqueta };
    });

  const metaSystemPrompt = construirMetaPrompt({
    tono,
    idioma,
    tieneAgenda: !!profesionalesTexto,
    variablesExistentes,
    variablesNuevas,
  });

  const mensajeNuevo = `Rubro del negocio: ${rubro.trim()}

Objetivo principal del agente: ${objetivo.trim()}
${reglas?.trim() ? `\nReglas especiales / cosas que debe o no debe hacer:\n${reglas.trim()}` : ""}`;

  const resultado = await generarRespuestaIA({
    proveedor,
    apiKey,
    systemPrompt: metaSystemPrompt,
    historial: [],
    mensajeNuevo,
  });

  if (!resultado.ok || !resultado.texto) {
    return NextResponse.json({ error: resultado.error ?? "No se pudo generar el prompt" }, { status: 502 });
  }

  await admin.from("agente_uso_ia").insert({
    cuenta_id: cuentaId,
    proveedor,
    modalidad: "asistente_prompt",
    tokens_entrada: resultado.tokensEntrada,
    tokens_salida: resultado.tokensSalida,
    tokens_total: resultado.tokensEntrada + resultado.tokensSalida,
    costo_usd: calcularCostoUsd(proveedor, resultado.tokensEntrada, resultado.tokensSalida),
  });

  return NextResponse.json({
    prompt: resultado.texto,
    variables_nuevas_sugeridas: variablesNuevas,
    costo_usd: calcularCostoUsd(proveedor, resultado.tokensEntrada, resultado.tokensSalida),
  });
}
