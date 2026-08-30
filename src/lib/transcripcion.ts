// La transcripción de audio siempre usa la API de OpenAI (Whisper),
// independientemente de qué proveedor tenga configurado cada cuenta para el
// chat -- Claude no ofrece transcripción, y no tiene sentido obligar a una
// cuenta en modo Claude/user_key a configurar también una key de OpenAI solo
// para poder recibir notas de voz. Por eso usa siempre la key de plataforma.
export async function transcribirAudio({
  audioBuffer,
  mimeType,
  apiKey,
}: {
  audioBuffer: ArrayBuffer;
  mimeType: string;
  apiKey: string;
}): Promise<{ ok: boolean; texto: string | null; error: string | null }> {
  const extension = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : mimeType.includes("mpeg") ? "mp3" : "ogg";

  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: mimeType }), `audio.${extension}`);
  form.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const data = await res.json();

  if (!res.ok) {
    return { ok: false, texto: null, error: data?.error?.message ?? "Error transcribiendo el audio" };
  }

  return { ok: true, texto: data?.text ?? null, error: null };
}
