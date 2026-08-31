import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { descifrar } from "@/lib/cifrado";
import { generarRespuestaIA, calcularCostoUsd, type ProveedorIA } from "@/lib/ia";
import { resolverLlaveDePlataforma } from "@/lib/plataforma-secretos";

const COLORES_SUGERENCIA = ["#8b5cf6", "#0ea5e9", "#f97316", "#eab308", "#22c55e", "#ef4444"];

function construirMetaPrompt(rubro: string): string {
  return `Eres un experto en procesos comerciales / pipelines de venta B2B y B2C.

Dado el rubro de un negocio, propone entre 4 y 6 etapas típicas de su proceso de venta, en el orden en que ocurren, desde el primer contacto hasta el cierre (ganado o perdido).

Responde ÚNICAMENTE con un arreglo JSON válido, sin explicaciones, sin markdown, sin comillas triples envolviéndolo. Cada elemento debe tener exactamente esta forma:
{"nombre": string (corto, 1-3 palabras, en español), "probabilidad_default": number (0-100, qué tan probable es cerrar ganado un deal que está en esa etapa), "es_ganada": boolean, "es_perdida": boolean}

La última etapa "ganada" debe tener es_ganada:true y probabilidad_default:100. Agrega también una etapa "perdida" con es_perdida:true y probabilidad_default:0. El resto son intermedias con es_ganada:false, es_perdida:false y probabilidad_default creciente conforme avanza el proceso.

Rubro del negocio: ${rubro}`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase.from("perfiles").select("cuenta_id").eq("id", user.id).single();
  if (!perfil) return NextResponse.json({ error: "Sin cuenta asociada" }, { status: 403 });

  const { rubro } = (await request.json()) as { rubro?: string };
  if (!rubro?.trim()) {
    return NextResponse.json({ error: "Falta el rubro del negocio" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: config } = await admin
    .from("agente_config")
    .select("proveedor_ia, modo_api, api_key_usuario_cifrada")
    .eq("cuenta_id", perfil.cuenta_id)
    .maybeSingle();

  const proveedor = (config?.proveedor_ia ?? "openai") as ProveedorIA;

  let apiKey: string | null = null;
  if (config?.modo_api === "user_key") {
    if (!config.api_key_usuario_cifrada) {
      return NextResponse.json({ error: "Configura primero una API key en Agente IA para usar las sugerencias." }, { status: 400 });
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
    systemPrompt: construirMetaPrompt(rubro.trim()),
    historial: [],
    mensajeNuevo: "Genera el arreglo JSON de etapas.",
  });

  if (!resultado.ok || !resultado.texto) {
    return NextResponse.json({ error: resultado.error ?? "No se pudieron generar sugerencias" }, { status: 502 });
  }

  let etapas: { nombre: string; probabilidad_default: number; es_ganada: boolean; es_perdida: boolean }[];
  try {
    const textoLimpio = resultado.texto.trim().replace(/^```json?\s*/i, "").replace(/```$/, "");
    etapas = JSON.parse(textoLimpio);
    if (!Array.isArray(etapas)) throw new Error("no es un arreglo");
  } catch {
    return NextResponse.json({ error: "El modelo no devolvió un formato válido, intenta de nuevo." }, { status: 502 });
  }

  const sugerencias = etapas.slice(0, 8).map((e, i) => ({
    nombre: String(e.nombre ?? "").slice(0, 60) || `Etapa ${i + 1}`,
    color: COLORES_SUGERENCIA[i % COLORES_SUGERENCIA.length],
    probabilidad_default: Math.min(100, Math.max(0, Number(e.probabilidad_default) || 0)),
    es_ganada: !!e.es_ganada,
    es_perdida: !!e.es_perdida,
  }));

  await admin.from("agente_uso_ia").insert({
    cuenta_id: perfil.cuenta_id,
    proveedor,
    modalidad: "sugerencia_etapas",
    tokens_entrada: resultado.tokensEntrada,
    tokens_salida: resultado.tokensSalida,
    tokens_total: resultado.tokensEntrada + resultado.tokensSalida,
    costo_usd: calcularCostoUsd(proveedor, resultado.tokensEntrada, resultado.tokensSalida),
  });

  return NextResponse.json({ sugerencias });
}
