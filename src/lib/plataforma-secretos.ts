import { createAdminClient } from "@/lib/supabase/admin";
import { descifrar } from "@/lib/cifrado";
import type { ProveedorIA } from "@/lib/ia";

type AdminClient = ReturnType<typeof createAdminClient>;

// El modo "platform_key" prioriza la key guardada en plataforma_secretos
// (rotable desde /configuracion sin tocar el servidor) y cae al .env del
// contenedor solo si todavía no se ha configurado ninguna ahí.
export async function resolverLlaveDePlataforma(admin: AdminClient, proveedor: ProveedorIA): Promise<string | null> {
  const clave = proveedor === "openai" ? "openai_api_key" : "anthropic_api_key";

  const { data } = await admin.from("plataforma_secretos").select("valor_cifrado").eq("clave", clave).maybeSingle();

  if (data?.valor_cifrado) return descifrar(data.valor_cifrado);

  return proveedor === "openai" ? process.env.OPENAI_API_KEY ?? null : process.env.ANTHROPIC_API_KEY ?? null;
}
