import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// AES-256-GCM para la API key que un cliente da en modo 'user_key'. La
// llave de cifrado sale de AGENTE_IA_CIFRADO_SECRETO -- debe ser el MISMO
// valor en todos los entornos que comparten la base (local y VPS usan la
// misma Supabase), o lo cifrado en uno no se puede descifrar en el otro.
function obtenerLlave() {
  const secreto = process.env.AGENTE_IA_CIFRADO_SECRETO;
  if (!secreto) throw new Error("Falta AGENTE_IA_CIFRADO_SECRETO en las variables de entorno");
  return scryptSync(secreto, "lexyon-agente-ia", 32);
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", obtenerLlave(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, cifrado]).toString("base64");
}

export function descifrar(valorCifrado: string): string {
  const datos = Buffer.from(valorCifrado, "base64");
  const iv = datos.subarray(0, 12);
  const authTag = datos.subarray(12, 28);
  const cifrado = datos.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", obtenerLlave(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString("utf8");
}
