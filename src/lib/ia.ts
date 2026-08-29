export type ProveedorIA = "openai" | "claude";

export type MensajeHistorial = { role: "user" | "assistant"; content: string };

// Esquema de parámetros estilo JSON Schema -- el mismo objeto sirve como
// "input_schema" de Anthropic o "parameters" de OpenAI sin transformación.
export type EsquemaHerramienta = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

export type Herramienta = {
  nombre: string;
  descripcion: string;
  parametros: EsquemaHerramienta;
};

export type EjecutorHerramienta = (nombre: string, input: Record<string, unknown>) => Promise<unknown>;

type ResultadoIA = {
  ok: boolean;
  texto: string | null;
  tokensEntrada: number;
  tokensSalida: number;
  error: string | null;
  accionesEjecutadas: string[];
};

// Modelos económicos por defecto -- no hay selector de modelo en el schema
// todavía, así que se elige uno razonable por proveedor en vez de forzar al
// usuario a decidir algo que no pidió.
const MODELO_POR_PROVEEDOR: Record<ProveedorIA, string> = {
  openai: "gpt-4o-mini",
  claude: "claude-sonnet-5",
};

// Precios aproximados en USD por cada 1M de tokens (publicados por cada
// proveedor al momento de escribir esto) -- cambian con el tiempo, revisar
// si el costo mostrado en Estadísticas se ve muy desalineado de la factura real.
const PRECIO_POR_MILLON: Record<ProveedorIA, { entrada: number; salida: number }> = {
  openai: { entrada: 0.15, salida: 0.6 },
  claude: { entrada: 3, salida: 15 },
};

export function calcularCostoUsd(proveedor: ProveedorIA, tokensEntrada: number, tokensSalida: number): number {
  const precio = PRECIO_POR_MILLON[proveedor];
  return (tokensEntrada * precio.entrada + tokensSalida * precio.salida) / 1_000_000;
}

// Tope de idas y vueltas de herramientas por mensaje entrante -- evita un
// loop infinito si el modelo insiste en llamar herramientas sin nunca dar
// una respuesta final.
const MAX_TURNOS_HERRAMIENTA = 5;

export async function generarRespuestaIA({
  proveedor,
  apiKey,
  systemPrompt,
  historial,
  mensajeNuevo,
  herramientas,
  ejecutarHerramienta,
}: {
  proveedor: ProveedorIA;
  apiKey: string;
  systemPrompt: string;
  historial: MensajeHistorial[];
  mensajeNuevo: string;
  herramientas?: Herramienta[];
  ejecutarHerramienta?: EjecutorHerramienta;
}): Promise<ResultadoIA> {
  try {
    if (proveedor === "openai") return await llamarOpenAI({ apiKey, systemPrompt, historial, mensajeNuevo, herramientas, ejecutarHerramienta });
    return await llamarClaude({ apiKey, systemPrompt, historial, mensajeNuevo, herramientas, ejecutarHerramienta });
  } catch (err) {
    return { ok: false, texto: null, tokensEntrada: 0, tokensSalida: 0, error: String(err), accionesEjecutadas: [] };
  }
}

async function llamarOpenAI({
  apiKey,
  systemPrompt,
  historial,
  mensajeNuevo,
  herramientas,
  ejecutarHerramienta,
}: {
  apiKey: string;
  systemPrompt: string;
  historial: MensajeHistorial[];
  mensajeNuevo: string;
  herramientas?: Herramienta[];
  ejecutarHerramienta?: EjecutorHerramienta;
}): Promise<ResultadoIA> {
  type MensajeOpenAI = {
    role: "system" | "user" | "assistant" | "tool";
    content?: string | null;
    tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
    tool_call_id?: string;
  };

  const tools = (herramientas ?? []).map((h) => ({
    type: "function" as const,
    function: { name: h.nombre, description: h.descripcion, parameters: h.parametros },
  }));

  const messages: MensajeOpenAI[] = [
    { role: "system", content: systemPrompt },
    ...historial.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: mensajeNuevo },
  ];

  let tokensEntrada = 0;
  let tokensSalida = 0;
  const accionesEjecutadas: string[] = [];

  for (let turno = 0; turno <= MAX_TURNOS_HERRAMIENTA; turno++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELO_POR_PROVEEDOR.openai,
        messages,
        ...(tools.length > 0 ? { tools } : {}),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { ok: false, texto: null, tokensEntrada, tokensSalida, error: data?.error?.message ?? "Error de OpenAI", accionesEjecutadas };
    }

    tokensEntrada += data?.usage?.prompt_tokens ?? 0;
    tokensSalida += data?.usage?.completion_tokens ?? 0;

    const mensaje = data?.choices?.[0]?.message;
    const toolCalls: { id: string; function: { name: string; arguments: string } }[] = mensaje?.tool_calls ?? [];

    if (toolCalls.length === 0 || !ejecutarHerramienta) {
      const texto: string | null = mensaje?.content?.trim() || null;
      return { ok: true, texto, tokensEntrada, tokensSalida, error: texto ? null : "Respuesta de OpenAI sin texto", accionesEjecutadas };
    }

    messages.push({ role: "assistant", content: mensaje.content ?? null, tool_calls: toolCalls.map((tc) => ({ id: tc.id, type: "function", function: tc.function })) });

    for (const llamada of toolCalls) {
      accionesEjecutadas.push(llamada.function.name);
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(llamada.function.arguments || "{}");
      } catch {
        // argumentos mal formados -- se ejecuta con input vacío y que la
        // herramienta reporte el error de vuelta al modelo.
      }
      let resultado: unknown;
      try {
        resultado = await ejecutarHerramienta(llamada.function.name, input);
      } catch (err) {
        resultado = { error: String(err) };
      }
      messages.push({ role: "tool", tool_call_id: llamada.id, content: JSON.stringify(resultado) });
    }
  }

  return { ok: false, texto: null, tokensEntrada, tokensSalida, error: "Se alcanzó el máximo de turnos de herramientas sin una respuesta final", accionesEjecutadas };
}

async function llamarClaude({
  apiKey,
  systemPrompt,
  historial,
  mensajeNuevo,
  herramientas,
  ejecutarHerramienta,
}: {
  apiKey: string;
  systemPrompt: string;
  historial: MensajeHistorial[];
  mensajeNuevo: string;
  herramientas?: Herramienta[];
  ejecutarHerramienta?: EjecutorHerramienta;
}): Promise<ResultadoIA> {
  type BloqueContenido = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> };
  type MensajeClaude = { role: "user" | "assistant"; content: string | BloqueContenido[] };

  const tools = (herramientas ?? []).map((h) => ({ name: h.nombre, description: h.descripcion, input_schema: h.parametros }));

  const messages: MensajeClaude[] = [
    ...historial.map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: mensajeNuevo },
  ];

  let tokensEntrada = 0;
  let tokensSalida = 0;
  const accionesEjecutadas: string[] = [];

  for (let turno = 0; turno <= MAX_TURNOS_HERRAMIENTA; turno++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO_POR_PROVEEDOR.claude,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        ...(tools.length > 0 ? { tools } : {}),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { ok: false, texto: null, tokensEntrada, tokensSalida, error: data?.error?.message ?? "Error de Claude", accionesEjecutadas };
    }

    tokensEntrada += data?.usage?.input_tokens ?? 0;
    tokensSalida += data?.usage?.output_tokens ?? 0;

    const bloques: BloqueContenido[] = data?.content ?? [];
    const llamadasHerramienta = bloques.filter((b) => b.type === "tool_use" && b.id && b.name);

    if (data?.stop_reason !== "tool_use" || llamadasHerramienta.length === 0 || !ejecutarHerramienta) {
      const texto = bloques.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim() || null;
      return { ok: true, texto, tokensEntrada, tokensSalida, error: texto ? null : `Respuesta de Claude sin bloque de texto: ${JSON.stringify(bloques)}`, accionesEjecutadas };
    }

    messages.push({ role: "assistant", content: bloques });

    const resultadosHerramientas: BloqueContenido[] = [];
    for (const bloque of llamadasHerramienta) {
      accionesEjecutadas.push(bloque.name!);
      let resultado: unknown;
      try {
        resultado = await ejecutarHerramienta(bloque.name!, bloque.input ?? {});
      } catch (err) {
        resultado = { error: String(err) };
      }
      resultadosHerramientas.push({ type: "tool_result", id: bloque.id, text: JSON.stringify(resultado) });
    }
    // El formato tool_result de Anthropic usa "tool_use_id" y "content", no
    // "id"/"text" -- se arma aparte para no forzar esas claves en el tipo
    // BloqueContenido usado también para leer la respuesta del modelo.
    messages.push({
      role: "user",
      content: resultadosHerramientas.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.text } as unknown as BloqueContenido)),
    });
  }

  return { ok: false, texto: null, tokensEntrada, tokensSalida, error: "Se alcanzó el máximo de turnos de herramientas sin una respuesta final", accionesEjecutadas };
}
