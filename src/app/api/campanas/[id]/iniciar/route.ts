import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Arma la cola de envío (campana_contactos) a partir de los contactos que
// tienen la etiqueta objetivo de la campaña -- el cron de /api/cron/campanas
// solo AVANZA filas 'pendiente' que ya existan, nunca las crea. Usa el
// cliente con sesión (no admin): RLS ya restringe todo a la cuenta del
// usuario, así que no hace falta service_role aquí.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const { variables } = await request.json().catch(() => ({ variables: [] }));
  const variablesGlobales = Array.isArray(variables) ? variables.map(String) : [];

  const { data: campana, error: campanaError } = await supabase
    .from("campanas")
    .select("id, cuenta_id, etiqueta_id, template_id, status")
    .eq("id", id)
    .single();

  if (campanaError || !campana) {
    return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  }

  if (!campana.template_id) {
    return NextResponse.json({ error: "Asigna una plantilla antes de iniciar la campaña" }, { status: 400 });
  }

  if (!campana.etiqueta_id) {
    return NextResponse.json({ error: "Asigna una etiqueta objetivo antes de iniciar la campaña" }, { status: 400 });
  }

  if (campana.status !== "borrador" && campana.status !== "pausada") {
    return NextResponse.json({ error: "Esta campaña ya fue iniciada" }, { status: 409 });
  }

  const { data: etiqueta } = await supabase.from("etiquetas").select("nombre").eq("id", campana.etiqueta_id).single();

  if (!etiqueta) {
    return NextResponse.json({ error: "La etiqueta objetivo ya no existe" }, { status: 400 });
  }

  const { data: contactos, error: contactosError } = await supabase
    .from("contactos")
    .select("id")
    .eq("status", "activo")
    .contains("etiquetas", [etiqueta.nombre]);

  if (contactosError) {
    return NextResponse.json({ error: contactosError.message }, { status: 500 });
  }

  if (!contactos || contactos.length === 0) {
    return NextResponse.json({ error: `No hay contactos activos con la etiqueta "${etiqueta.nombre}"` }, { status: 400 });
  }

  const filas = contactos.map((c) => ({
    campana_id: id,
    contacto_id: c.id,
    variables: variablesGlobales,
  }));

  // onConflict evita duplicar filas si la campaña se pausó y se vuelve a
  // iniciar con contactos que ya tenían una entrada de un intento anterior.
  const { error: insertError } = await supabase
    .from("campana_contactos")
    .upsert(filas, { onConflict: "campana_id,contacto_id", ignoreDuplicates: true });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("campanas")
    .update({ status: "enviando", total_destinatarios: contactos.length })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, total_destinatarios: contactos.length });
}
