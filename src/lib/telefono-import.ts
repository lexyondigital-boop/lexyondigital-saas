// Normaliza teléfonos capturados a mano en un CSV al mismo formato que ya
// usa el resto de la plataforma para México (wa_id = "521" + 10 dígitos,
// ver REGLAS_NUMERO_POR_PAIS en src/lib/meta.ts) -- así un contacto
// importado y ese mismo contacto escribiendo por WhatsApp coinciden en
// contactos.telefono (unique cuenta_id+telefono) en vez de duplicarse.
//
// Solo México está habilitado: mismo criterio de "no adivinar" ya
// documentado en meta.ts -- un país sin regla verificada contra la Graph
// API real no se agrega aquí.
export type PaisImportacion = "MX";

export function normalizarTelefonoImportado(
  numeroCrudo: string,
  pais: PaisImportacion,
): { ok: true; telefono: string } | { ok: false; error: string } {
  const digitos = numeroCrudo.replace(/\D/g, "");

  if (pais !== "MX") {
    return { ok: false, error: `País de importación no soportado: ${pais}` };
  }

  if (digitos.length === 10) {
    return { ok: true, telefono: `521${digitos}` };
  }
  if (digitos.length === 11 && digitos.startsWith("1")) {
    return { ok: true, telefono: `52${digitos}` };
  }
  if (digitos.length === 12 && digitos.startsWith("52")) {
    return { ok: true, telefono: `521${digitos.slice(2)}` };
  }
  if (digitos.length === 13 && digitos.startsWith("521")) {
    return { ok: true, telefono: digitos };
  }

  return { ok: false, error: "Formato de teléfono no reconocido" };
}
