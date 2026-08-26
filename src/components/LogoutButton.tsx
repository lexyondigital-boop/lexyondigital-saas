"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function cerrarSesion() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      onClick={cerrarSesion}
      className="w-full rounded-lg px-3 py-1.5 text-left text-sm text-[var(--color-texto-mute)] hover:bg-[var(--color-tarjeta)] hover:text-[var(--color-texto)]"
    >
      Cerrar sesión
    </button>
  );
}
