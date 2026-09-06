import type { createClient } from "@/lib/supabase/client";

type BrowserClient = ReturnType<typeof createClient>;

// Cambiar la etiqueta de un contacto es una señal de "ya le di
// seguimiento" para el orden de la lista de Conversaciones (ver
// ConversacionesView.tsx) -- por eso todo cambio directo de `etiquetas`
// pasa por aquí para que quede marcada la fecha.
export async function actualizarEtiquetasContacto(supabase: BrowserClient, contactoId: string, etiquetas: string[]) {
  return supabase
    .from("contactos")
    .update({ etiquetas, etiquetas_actualizadas_en: new Date().toISOString() })
    .eq("id", contactoId);
}

export function etiquetasCambiaron(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return true;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.some((v, i) => v !== sb[i]);
}
