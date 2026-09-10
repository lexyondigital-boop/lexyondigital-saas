import { createAdminClient } from "@/lib/supabase/admin";
import type { CampoPersonalizado } from "@/lib/campos-personalizados";
import { validarValorVariable } from "@/lib/agente-prompt-variables";

type AdminClient = ReturnType<typeof createAdminClient>;

// Guarda en el contacto datos capturados por un agente (WhatsApp o Voz),
// según las Variables (campos_personalizados) que ese agente tenga
// habilitadas. Cada clave se valida por su tipo antes de guardar -- si no es
// válida, el llamador recibe el motivo de vuelta. Compartido entre canales
// para que el mismo dato caiga siempre en el mismo lugar del contacto sin
// importar por dónde se capturó.
export async function guardarValoresCapturados(
  admin: AdminClient,
  contactoId: string,
  camposUsados: CampoPersonalizado[],
  input: Record<string, unknown>,
): Promise<{ guardados: Record<string, string>; errores?: Record<string, string> }> {
  const porClave = new Map(camposUsados.filter((c) => c.clave_variable).map((c) => [c.clave_variable as string, c]));

  const guardados: Record<string, string> = {};
  const errores: Record<string, string> = {};
  const columnasReales: Record<string, string> = {};
  const filasCustom: { contacto_id: string; campo_id: string; valor: string }[] = [];

  for (const [clave, valorCrudo] of Object.entries(input)) {
    const campo = porClave.get(clave);
    if (!campo) {
      errores[clave] = "esa clave no es una variable definida para este agente";
      continue;
    }
    // El teléfono es la llave real de enrutamiento -- nunca se sobrescribe
    // desde acá, aunque la IA lo intente (ya se excluyó del esquema de la
    // herramienta, esto es una segunda barrera).
    if (campo.mapea_a_columna_real === "telefono") {
      errores[clave] = "el teléfono no se puede modificar por el agente";
      continue;
    }
    const errorValidacion = validarValorVariable(campo.tipo, valorCrudo);
    if (errorValidacion) {
      errores[clave] = errorValidacion;
      continue;
    }
    const valor = String(valorCrudo).trim();
    if (campo.mapea_a_columna_real === "nombre_completo") columnasReales.nombre_completo = valor;
    else if (campo.mapea_a_columna_real === "correo_electronico") columnasReales.correo_electronico = valor;
    else filasCustom.push({ contacto_id: contactoId, campo_id: campo.id, valor });
    guardados[clave] = valor;
  }

  if (Object.keys(columnasReales).length > 0) {
    await admin.from("contactos").update(columnasReales).eq("id", contactoId);
  }
  if (filasCustom.length > 0) {
    await admin.from("valores_campos_personalizados").upsert(filasCustom, { onConflict: "contacto_id,campo_id" });
  }

  return { guardados, ...(Object.keys(errores).length > 0 ? { errores } : {}) };
}
