"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Esferita junto a "Pipeline" en la barra lateral -- mismo patrón que
// NotificacionesConversaciones.tsx. "Alerta" = un deal abierto sin actividad
// en más de UMBRAL_DORMIDO_DIAS días, o una tarea pendiente vencida/por
// vencer en las próximas 48h. Se calcula al vuelo, sin cron ni tabla de
// notificaciones -- no hay infraestructura de push/email en el proyecto, así
// que esto sigue el mismo criterio ya aceptado para "conversaciones pendientes".
const UMBRAL_DORMIDO_DIAS = 7;
const UMBRAL_TAREA_HORAS = 48;

export function NotificacionesPipeline({ cuentaId }: { cuentaId: string }) {
  const [alertas, setAlertas] = useState(0);

  useEffect(() => {
    const supabase = createClient();

    async function calcular() {
      const ahora = Date.now();
      const limiteDormido = new Date(ahora - UMBRAL_DORMIDO_DIAS * 24 * 60 * 60 * 1000).toISOString();
      const limiteTarea = new Date(ahora + UMBRAL_TAREA_HORAS * 60 * 60 * 1000).toISOString();

      const [{ count: dormidos }, { count: tareas }] = await Promise.all([
        supabase
          .from("deals")
          .select("id", { count: "exact", head: true })
          .eq("cuenta_id", cuentaId)
          .eq("estado", "abierto")
          .lt("ultima_actividad_en", limiteDormido),
        supabase
          .from("tareas")
          .select("id", { count: "exact", head: true })
          .eq("cuenta_id", cuentaId)
          .eq("completada", false)
          .lt("fecha_vencimiento", limiteTarea),
      ]);

      setAlertas((dormidos ?? 0) + (tareas ?? 0));
    }

    calcular();

    const canal = supabase
      .channel(`notificaciones-pipeline-${cuentaId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `cuenta_id=eq.${cuentaId}` }, () => calcular())
      .on("postgres_changes", { event: "*", schema: "public", table: "tareas", filter: `cuenta_id=eq.${cuentaId}` }, () => calcular())
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [cuentaId]);

  if (alertas === 0) return null;

  return (
    <span
      className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white"
      style={{ background: "var(--color-aviso)" }}
    >
      {alertas > 99 ? "99+" : alertas}
    </span>
  );
}
