import { promises as dns } from "dns";
import { isIP } from "net";
import * as cheerio from "cheerio";

// Este módulo alimenta el "conocimiento" que el agente IA puede leer de
// verdad (a diferencia de antes, donde Documentos solo guardaba un link que
// nadie procesaba -- ver agente-ia-runtime.ts). Dos fuentes: PDF subido y
// sitio web conectado. Ambas devuelven texto plano truncado a un tamaño
// razonable para no disparar el costo de cada respuesta del agente ni
// arriesgar el límite de contexto del modelo.

export const LIMITE_TAMANO_PDF_BYTES = 15 * 1024 * 1024; // 15 MB
export const LIMITE_CARACTERES_POR_FUENTE = 8000; // ~2,000 tokens por documento/sitio
export const LIMITE_CARACTERES_TOTAL_CONOCIMIENTO = 24000; // ~6,000 tokens combinados en el prompt

function truncar(texto: string, limite: number): string {
  const limpio = texto.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (limpio.length <= limite) return limpio;
  return `${limpio.slice(0, limite)}\n\n[...contenido recortado por longitud...]`;
}

export async function extraerTextoPdf(bytes: ArrayBuffer): Promise<{ ok: boolean; texto: string | null; error: string | null }> {
  try {
    // pdf-parse es CommonJS y no tiene export default real -- require()
    // evita el problema de interop de ESM con este paquete en particular.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (data: Buffer) => Promise<{ text: string }>;
    const resultado = await pdfParse(Buffer.from(bytes));
    const texto = resultado.text?.trim();
    if (!texto) {
      return { ok: false, texto: null, error: "El PDF no tiene texto extraíble (¿es un escaneo de imágenes sin OCR?)." };
    }
    return { ok: true, texto: truncar(texto, LIMITE_CARACTERES_POR_FUENTE), error: null };
  } catch (err) {
    return { ok: false, texto: null, error: `No se pudo leer el PDF: ${String(err)}` };
  }
}

// Rangos privados/locales -- si la URL del "sitio del negocio" resuelve a
// alguno de estos, se rechaza. Sin este chequeo, el formulario sería una
// forma de hacer que nuestro propio servidor pegue peticiones a su propia
// red interna (SSRF) con solo pegar una URL.
function esIpPrivadaOLocal(ip: string): boolean {
  if (isIP(ip) === 4) {
    const partes = ip.split(".").map(Number);
    const [a, b] = partes;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    return false;
  }
  const normalizado = ip.toLowerCase();
  if (normalizado === "::1") return true;
  if (normalizado.startsWith("fe80:")) return true;
  if (normalizado.startsWith("fc") || normalizado.startsWith("fd")) return true;
  return false;
}

export async function validarUrlPublica(urlTexto: string): Promise<{ ok: boolean; error?: string; url?: URL }> {
  let url: URL;
  try {
    url = new URL(urlTexto);
  } catch {
    return { ok: false, error: "La URL no es válida." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Solo se admiten URLs http:// o https://." };
  }
  let direcciones: { address: string }[];
  try {
    direcciones = await dns.lookup(url.hostname, { all: true });
  } catch {
    return { ok: false, error: "No se pudo resolver el dominio -- revisa que la URL sea correcta." };
  }
  if (direcciones.length === 0 || direcciones.some((d) => esIpPrivadaOLocal(d.address))) {
    return { ok: false, error: "Esa URL apunta a una red privada o local, no se puede conectar." };
  }
  return { ok: true, url };
}

const LIMITE_DESCARGA_BYTES = 5 * 1024 * 1024; // 5 MB de HTML crudo, antes de extraer texto
const MAX_REDIRECCIONES = 5;

// redirect: "manual" a propósito -- con "follow", una URL pública válida
// podría redirigir a una IP privada (ej. http://negocio.com -> 127.0.0.1) y
// el fetch la seguiría igual, dejando sin efecto la validación de arriba.
// Cada salto se vuelve a validar contra la misma lista de redes privadas.
async function descargarConLimite(urlInicial: URL): Promise<{ ok: boolean; html: string | null; error: string | null }> {
  let url = urlInicial;

  for (let salto = 0; salto <= MAX_REDIRECCIONES; salto++) {
    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), 12000);

    try {
      const res = await fetch(url, {
        signal: controlador.signal,
        redirect: "manual",
        headers: { "User-Agent": "LexyondigitalCRM-AgenteIA/1.0 (+conocimiento del negocio)" },
      });

      if (res.status >= 300 && res.status < 400) {
        const destino = res.headers.get("location");
        if (!destino) return { ok: false, html: null, error: "El sitio redirige sin indicar destino." };
        if (salto === MAX_REDIRECCIONES) return { ok: false, html: null, error: "Demasiadas redirecciones." };

        const siguienteUrl = new URL(destino, url);
        const validacion = await validarUrlPublica(siguienteUrl.toString());
        if (!validacion.ok || !validacion.url) {
          return { ok: false, html: null, error: validacion.error ?? "Redirección a una URL no permitida." };
        }
        url = validacion.url;
        continue;
      }

      if (!res.ok) {
        return { ok: false, html: null, error: `El sitio respondió con estado ${res.status}.` };
      }

      const tipo = res.headers.get("content-type") ?? "";
      if (!tipo.includes("text/html") && !tipo.includes("application/xhtml")) {
        return { ok: false, html: null, error: `Esa URL no devolvió una página web (content-type: ${tipo || "desconocido"}).` };
      }

      if (!res.body) {
        return { ok: false, html: null, error: "El sitio no devolvió contenido." };
      }

      const lector = res.body.getReader();
      const trozos: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > LIMITE_DESCARGA_BYTES) {
            await lector.cancel();
            return { ok: false, html: null, error: "La página es demasiado grande para procesarla." };
          }
          trozos.push(value);
        }
      }
      const html = Buffer.concat(trozos.map((t) => Buffer.from(t))).toString("utf-8");
      return { ok: true, html, error: null };
    } catch (err) {
      const esTimeout = err instanceof Error && err.name === "AbortError";
      return { ok: false, html: null, error: esTimeout ? "El sitio tardó demasiado en responder." : `No se pudo conectar: ${String(err)}` };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { ok: false, html: null, error: "Demasiadas redirecciones." };
}

export async function extraerTextoSitioWeb(urlTexto: string): Promise<{ ok: boolean; texto: string | null; error: string | null }> {
  const validacion = await validarUrlPublica(urlTexto);
  if (!validacion.ok || !validacion.url) {
    return { ok: false, texto: null, error: validacion.error ?? "URL inválida." };
  }

  const descarga = await descargarConLimite(validacion.url);
  if (!descarga.ok || !descarga.html) {
    return { ok: false, texto: null, error: descarga.error };
  }

  const $ = cheerio.load(descarga.html);
  $("script, style, noscript, svg, iframe, template").remove();
  // Sin esto, el texto de tags distintos queda pegado sin espacio (ej.
  // "NegocioOfrecemos") porque cheerio concatena los nodos de texto tal cual
  // -- se inserta un salto de línea después de cada elemento de bloque antes
  // de leer el texto plano.
  $("p, div, li, h1, h2, h3, h4, h5, h6, tr, section, article, header, footer, nav, main, aside, ul, ol, table, address, br").after("\n");
  const texto = $("body")
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

  if (!texto) {
    return { ok: false, texto: null, error: "No se encontró texto legible en esa página." };
  }

  return { ok: true, texto: truncar(texto, LIMITE_CARACTERES_POR_FUENTE), error: null };
}
