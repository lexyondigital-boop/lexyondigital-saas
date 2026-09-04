import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverParametrosPlantilla, sustituirParametrosPlantilla } from "@/lib/variables-contacto";

// Vista previa de una plantilla ya sustituida con el dato REAL de un
// contacto (cuando la posición está ligada a una variable y el contacto ya
// la tiene capturada) -- la usa el envío individual de plantilla desde
// Conversaciones, para que el admin vea lo que ese contacto en específico
// va a recibir antes de mandarlo.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { template_id, contacto_id } = (await request.json()) as { template_id?: string; contacto_id?: string };
  if (!template_id || !contacto_id) {
    return NextResponse.json({ error: "Falta template_id o contacto_id" }, { status: 400 });
  }

  const { data: perfil } = await supabase.from("perfiles").select("cuenta_id").eq("id", user.id).single();
  if (!perfil) return NextResponse.json({ error: "Sin cuenta asociada" }, { status: 403 });

  const admin = createAdminClient();

  const { data: template } = await admin
    .from("templates")
    .select("body, variables, variables_mapeo, header_tipo, header_media_url, footer_texto, botones, usa_carrusel")
    .eq("id", template_id)
    .eq("cuenta_id", perfil.cuenta_id)
    .maybeSingle();

  if (!template) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });

  const { data: contacto } = await admin.from("contactos").select("id").eq("id", contacto_id).eq("cuenta_id", perfil.cuenta_id).maybeSingle();
  if (!contacto) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  const parametros = await resolverParametrosPlantilla(admin, perfil.cuenta_id, contacto_id, template);

  return NextResponse.json({
    body: sustituirParametrosPlantilla(template.body, parametros) ?? "",
    header_tipo: template.header_tipo,
    header_media_url: template.header_media_url,
    footer_texto: template.footer_texto,
    botones: template.botones,
    usa_carrusel: template.usa_carrusel,
  });
}
