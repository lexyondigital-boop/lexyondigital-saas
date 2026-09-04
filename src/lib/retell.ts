import { createAdminClient } from "@/lib/supabase/admin";
import { descifrar } from "@/lib/cifrado";

type AdminClient = ReturnType<typeof createAdminClient>;

// Valida la API key contra Retell ANTES de guardar nada -- así no se
// arriesga a dejar guardada una key que no sirve.
export async function validarApiKeyRetell(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.retellai.com/v2/list-agents", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });
    if (res.status === 401) return { ok: false, error: "La API key no es válida" };
    if (!res.ok) return { ok: false, error: `Retell respondió con un error (${res.status})` };
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo conectar con Retell" };
  }
}

// La key maestra de lexyondigital vive en plataforma_secretos (misma tabla
// que las de OpenAI/Anthropic) -- se resuelve aparte de
// resolverLlaveDePlataforma() porque esa función está tipada a ProveedorIA.
export async function resolverLlaveMaestraRetell(admin: AdminClient): Promise<string | null> {
  const { data } = await admin.from("plataforma_secretos").select("valor_cifrado").eq("clave", "retell_api_key").maybeSingle();
  return data?.valor_cifrado ? descifrar(data.valor_cifrado) : null;
}

// Resuelve qué API key de Retell usar para una cuenta: la suya propia si
// eligió modo 'propia', o la maestra de lexyondigital si eligió 'master'.
// La usan el cron de campañas de voz y cualquier llamada a Retell.
export async function resolverApiKeyRetell(admin: AdminClient, cuentaId: string): Promise<string | null> {
  const { data } = await admin
    .from("cuentas_retell")
    .select("modo, api_key_cifrada")
    .eq("cuenta_id", cuentaId)
    .eq("activo", true)
    .maybeSingle();

  if (!data) return null;
  if (data.modo === "propia") return data.api_key_cifrada ? descifrar(data.api_key_cifrada) : null;
  return resolverLlaveMaestraRetell(admin);
}
