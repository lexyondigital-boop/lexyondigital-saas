"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TIEMPO_INACTIVIDAD_MS = 10 * 60 * 1000;
const INTERVALO_REVISION_MS = 15_000;
const THROTTLE_ESCRITURA_MS = 2_000;
const CLAVE_ULTIMA_ACTIVIDAD = "lexyondigital_ultima_actividad";
const EVENTOS_ACTIVIDAD = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"] as const;

// localStorage (no estado en memoria) a propósito: es compartido entre
// pestañas del mismo navegador, así que la sesión solo se considera
// inactiva si NINGUNA pestaña tuvo actividad -- coincide con "si la
// sesión no se está utilizando", que es a nivel sesión, no por pestaña.
export function InactivityWatcher() {
  const router = useRouter();

  useEffect(() => {
    let ultimoRegistro = 0;

    function marcarActividad() {
      const ahora = Date.now();
      if (ahora - ultimoRegistro < THROTTLE_ESCRITURA_MS) return;
      ultimoRegistro = ahora;
      localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(ahora));
    }

    marcarActividad();
    for (const evento of EVENTOS_ACTIVIDAD) window.addEventListener(evento, marcarActividad, { passive: true });

    const intervalo = setInterval(async () => {
      const ultima = Number(localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD)) || Date.now();
      if (Date.now() - ultima < TIEMPO_INACTIVIDAD_MS) return;

      clearInterval(intervalo);
      await fetch("/api/auditoria/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: "inactividad" }),
      }).catch(() => {});
      await createClient().auth.signOut();
      router.replace("/login");
      router.refresh();
    }, INTERVALO_REVISION_MS);

    return () => {
      for (const evento of EVENTOS_ACTIVIDAD) window.removeEventListener(evento, marcarActividad);
      clearInterval(intervalo);
    };
  }, [router]);

  return null;
}
