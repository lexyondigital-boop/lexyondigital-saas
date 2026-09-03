import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// Antes duplicada de forma idéntica en el webhook de WhatsApp (contacto
// escribe primero) y en el cron de campañas (negocio escribe primero) --
// unificada aquí para que el envío manual de plantillas desde la tabla de
// Contactos también pueda reusarla.
export async function obtenerOCrearConversacion(
  supabase: AdminClient,
  cuentaId: string,
  contactoId: string,
  telefono: string,
  opciones?: { ventanaActiva?: boolean },
) {
  const { data: existente } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("contacto_id", contactoId)
    .eq("status", "abierta")
    .maybeSingle();

  if (existente) return existente;

  const { data: nueva } = await supabase
    .from("conversaciones")
    .insert({
      cuenta_id: cuentaId,
      contacto_id: contactoId,
      telefono,
      status: "abierta",
      agente_ia_activo: true,
      ventana_activa: opciones?.ventanaActiva ?? false,
    })
    .select("id")
    .single();

  return nueva;
}
