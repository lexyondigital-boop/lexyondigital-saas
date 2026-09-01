const GRAPH_API_VERSION = "v21.0";

type ResultadoMeta = { ok: boolean; raw: unknown; error: string | null };

// POST /{waba_id}/message_templates -- somete una plantilla nueva a revisión
// real de Meta. `components` ya viene armado por quien llama (encabezado,
// body, footer, botones o carrusel) siguiendo el esquema exacto que exige la
// Graph API -- ver src/app/api/plantillas/route.ts para cómo se arma.
export async function crearPlantillaMeta({
  wabaId,
  accessToken,
  nombre,
  categoria,
  idioma,
  components,
}: {
  wabaId: string;
  accessToken: string;
  nombre: string;
  categoria: string;
  idioma: string;
  components: unknown[];
}): Promise<ResultadoMeta & { metaTemplateId: string | null; status: string | null }> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: nombre, category: categoria, language: idioma, components }),
  });

  const data = await res.json();

  return {
    ok: res.ok && !!data?.id,
    metaTemplateId: data?.id ?? null,
    status: data?.status ?? null,
    raw: data,
    error: res.ok ? null : (data?.error?.error_user_msg ?? data?.error?.message ?? "Error desconocido al crear la plantilla"),
  };
}

// DELETE /{waba_id}/message_templates?name=X -- se llama al borrar una
// plantilla local para no dejarla huérfana viva en Meta. Se ignora si ya no
// existe allá (por ejemplo, si nunca se llegó a someter con éxito).
export async function eliminarPlantillaMeta({
  wabaId,
  accessToken,
  nombre,
}: {
  wabaId: string;
  accessToken: string;
  nombre: string;
}): Promise<ResultadoMeta> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/message_templates?name=${encodeURIComponent(nombre)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, raw: data, error: res.ok ? null : (data?.error?.message ?? "Error desconocido al eliminar en Meta") };
}

// Paso 1 de la API de "Resumable Upload" de Meta: abre una sesión de subida
// y devuelve un id con forma "upload:XXXX" que ya incluye el prefijo -- se
// usa tal cual como path del paso 2.
export async function iniciarSubidaResumable({
  appId,
  accessToken,
  fileLength,
  fileType,
}: {
  appId: string;
  accessToken: string;
  fileLength: number;
  fileType: string;
}): Promise<{ ok: boolean; uploadSessionId: string | null; error: string | null }> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${appId}/uploads`);
  url.searchParams.set("file_length", String(fileLength));
  url.searchParams.set("file_type", fileType);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json();

  if (!res.ok || !data?.id) {
    return { ok: false, uploadSessionId: null, error: data?.error?.message ?? "No se pudo iniciar la subida a Meta" };
  }

  return { ok: true, uploadSessionId: data.id, error: null };
}

// Paso 2: sube los bytes completos de una sola vez (los medios de plantilla
// son pequeños comparados con el límite de Meta) y devuelve el "handle" que
// luego se manda como example.header_handle / la media de una tarjeta de
// carrusel al crear la plantilla. Nota: este paso exige el esquema "OAuth"
// literal en el header, no "Bearer" -- así lo documenta Meta y difiere del
// resto de las llamadas a la Graph API en este proyecto.
export async function subirBloqueResumable({
  uploadSessionId,
  accessToken,
  datos,
}: {
  uploadSessionId: string;
  accessToken: string;
  datos: ArrayBuffer;
}): Promise<{ ok: boolean; handle: string | null; error: string | null }> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${uploadSessionId}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${accessToken}`,
      file_offset: "0",
    },
    body: datos,
  });

  const data = await res.json();

  if (!res.ok || !data?.h) {
    return { ok: false, handle: null, error: data?.error?.message ?? "No se pudo subir el archivo a Meta" };
  }

  return { ok: true, handle: data.h, error: null };
}

// Combina los dos pasos anteriores. Si no hay META_APP_ID configurado,
// devuelve un error controlado en vez de tronar -- el resto del asistente de
// plantillas sigue funcionando y solo el encabezado con medio / el carrusel
// quedan como borrador local hasta que se configure la variable.
export async function subirMedioParaHandle({
  accessToken,
  bytes,
  mimeType,
}: {
  accessToken: string;
  bytes: ArrayBuffer;
  mimeType: string;
}): Promise<{ ok: boolean; handle: string | null; error: string | null }> {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    return { ok: false, handle: null, error: "META_APP_ID no está configurado en el servidor" };
  }

  const sesion = await iniciarSubidaResumable({ appId, accessToken, fileLength: bytes.byteLength, fileType: mimeType });
  if (!sesion.ok || !sesion.uploadSessionId) {
    return { ok: false, handle: null, error: sesion.error };
  }

  const bloque = await subirBloqueResumable({ uploadSessionId: sesion.uploadSessionId, accessToken, datos: bytes });
  return { ok: bloque.ok, handle: bloque.handle, error: bloque.error };
}
