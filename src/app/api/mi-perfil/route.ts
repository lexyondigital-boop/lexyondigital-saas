import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Autoservicio: cualquier usuario logueado (sin importar su rol) puede
// actualizar su PROPIO teléfono. La RLS de "perfiles" solo deja actualizar a
// admins de la cuenta, así que aquí se usa el cliente admin -- pero acotado
// siempre a su propio id (auth.getUser()), nunca a uno recibido del body.
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { telefono } = await request.json();
  if (!telefono?.trim()) {
    return NextResponse.json({ error: "El teléfono es obligatorio" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("perfiles").update({ telefono: telefono.trim() }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
