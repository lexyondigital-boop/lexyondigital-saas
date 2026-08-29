export type ProveedorIA = "openai" | "claude";

export type MensajeHistorial = { role: "user" | "assistant"; content: string };

type ResultadoIA = {
  ok: boolean;
  texto: string | null;
  tokensEntrada: number;
  tokensSalida: number;
  error: string | null;
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

export async function generarRespuestaIA({
  proveedor,
  apiKey,
  systemPrompt,
  historial,
  mensajeNuevo,
}: {
  proveedor: ProveedorIA;
  apiKey: string;
  systemPrompt: string;
  historial: MensajeHistorial[];
  mensajeNuevo: string;
}): Promise<ResultadoIA> {
  try {
    if (proveedor === "openai") return await llamarOpenAI({ apiKey, systemPrompt, historial, mensajeNuevo });
    return await llamarClaude({ apiKey, systemPrompt, historial, mensajeNuevo });
  } catch (err) {
    return { ok: false, texto: null, tokensEntrada: 0, tokensSalida: 0, error: String(err) };
  }
}

async function llamarOpenAI({
  apiKey,
  systemPrompt,
  historial,
  mensajeNuevo,
}: {
  apiKey: string;
  systemPrompt: string;
  historial: MensajeHistorial[];
  mensajeNuevo: string;
}): Promise<ResultadoIA> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELO_POR_PROVEEDOR.openai,
      messages: [{ role: "system", content: systemPrompt }, ...historial, { role: "user", content: mensajeNuevo }],
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { ok: false, texto: null, tokensEntrada: 0, tokensSalida: 0, error: data?.error?.message ?? "Error de OpenAI" };
  }

  return {
    ok: true,
    texto: data?.choices?.[0]?.message?.content ?? null,
    tokensEntrada: data?.usage?.prompt_tokens ?? 0,
    tokensSalida: data?.usage?.completion_tokens ?? 0,
    error: null,
  };
}

async function llamarClaude({
  apiKey,
  systemPrompt,
  historial,
  mensajeNuevo,
}: {
  apiKey: string;
  systemPrompt: string;
  historial: MensajeHistorial[];
  mensajeNuevo: string;
}): Promise<ResultadoIA> {
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
      messages: [...historial, { role: "user", content: mensajeNuevo }],
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { ok: false, texto: null, tokensEntrada: 0, tokensSalida: 0, error: data?.error?.message ?? "Error de Claude" };
  }

  return {
    ok: true,
    texto: data?.content?.[0]?.text ?? null,
    tokensEntrada: data?.usage?.input_tokens ?? 0,
    tokensSalida: data?.usage?.output_tokens ?? 0,
    error: null,
  };
}
