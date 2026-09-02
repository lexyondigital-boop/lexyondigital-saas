import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Arma la cola de envío (campana_contactos) y arranca la campaña. Las dos
// formas de armar audiencia conviven: si ya se cargaron contactos por CSV
// (src/app/api/campanas/[id]/cargar-contactos/route.ts) se usan tal cual;
// si no hay ninguno todavía, se cae al comportamiento de siempre (armar la
// cola desde los contactos que tienen la etiqueta objetivo). El cron de
// /api/cron/campanas solo AVANZA filas 'pendiente' que ya existan, nunca las
// crea. Usa el cliente con sesión (no admin): RLS ya restringe todo a la
// cuenta del usuario.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;

  const { data: campana, error: campanaError } = await supabase
    .from("campanas")
    .select("id, cuenta_id, etiqueta_id, template_id, canal, plantilla_email_id, status")
    .eq("id", id)
    .single();

  if (campanaError || !campana) {
    return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  }

  if (campana.canal === "correo" ? !campana.plantilla_email_id : !campana.template_id) {
    return NextResponse.json({ error: "Asigna una plantilla antes de iniciar la campaña" }, { status: 400 });
  }

  if (campana.status !== "borrador" && campana.status !== "pausada") {
    return NextResponse.json({ error: "Esta campaña ya fue iniciada" }, { status: 409 });
  }

  const { count: yaCargados } = await supabase
    .from("campana_contactos")
    .select("id", { count: "exact", head: true })
    .eq("campana_id", id);

  let totalDestinatarios = yaCargados ?? 0;

  if (totalDestinatarios === 0) {
    if (!campana.etiqueta_id) {
      return NextResponse.json({ error: "Carga contactos o elige una etiqueta objetivo antes de iniciar la campaña" }, { status: 400 });
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

    const filas = contactos.map((c) => ({ campana_id: id, contacto_id: c.id }));

    // onConflict evita duplicar filas si la campaña se pausó y se vuelve a
    // iniciar con contactos que ya tenían una entrada de un intento anterior.
    const { error: insertError } = await supabase
      .from("campana_contactos")
      .upsert(filas, { onConflict: "campana_id,contacto_id", ignoreDuplicates: true });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    totalDestinatarios = contactos.length;
  }

  const { error: updateError } = await supabase
    .from("campanas")
    .update({ status: "enviando", total_destinatarios: totalDestinatarios })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, total_destinatarios: totalDestinatarios });
}
