import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/require-super-admin";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; membresiaId: string }> }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, membresiaId } = await params;
  const admin = createAdminClient();

  const { error } = await admin.from("membresias_cuenta").delete().eq("id", membresiaId).eq("cuenta_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
