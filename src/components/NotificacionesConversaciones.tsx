"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type UltimoMensaje = { direccion: "entrante" | "saliente"; created_at: string };

// Esferita de conversaciones pendientes + campanita sonora junto a
// "Conversaciones" en la barra lateral. "Pendiente" = una conversación
// abierta cuyo último mensaje es entrante y llegó después de la última vez
// que un humano la abrió (ultimo_visto_en, actualizado en ConversacionesView).
export function NotificacionesConversaciones({ cuentaId }: { cuentaId: string }) {
  const [pendientes, setPendientes] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  function reproducirBeep() {
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // Los navegadores bloquean audio hasta la primera interacción del
      // usuario con la página -- no es un error, simplemente no suena hasta
      // el primer clic/tecla, como cualquier autoplay de audio.
    }
  }

  useEffect(() => {
    const supabase = createClient();

    async function calcularPendientes() {
      const [{ data: conversaciones }, { data: mensajesRecientes }] = await Promise.all([
        supabase.from("conversaciones").select("id, ultimo_visto_en").eq("cuenta_id", cuentaId).eq("status", "abierta"),
        supabase
          .from("mensajes")
          .select("conversacion_id, direccion, created_at")
          .eq("cuenta_id", cuentaId)
          .not("conversacion_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(300),
      ]);

      const ultimoPorConversacion = new Map<string, UltimoMensaje>();
      for (const m of mensajesRecientes ?? []) {
        if (m.conversacion_id && !ultimoPorConversacion.has(m.conversacion_id)) {
          ultimoPorConversacion.set(m.conversacion_id, { direccion: m.direccion, created_at: m.created_at });
        }
      }

      let contador = 0;
      for (const c of conversaciones ?? []) {
        const ultimo = ultimoPorConversacion.get(c.id);
        if (ultimo && ultimo.direccion === "entrante" && new Date(ultimo.created_at) > new Date(c.ultimo_visto_en)) {
          contador++;
        }
      }
      setPendientes(contador);
    }

    calcularPendientes();

    const canal = supabase
      .channel(`notificaciones-conversaciones-${cuentaId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensajes", filter: `cuenta_id=eq.${cuentaId}` },
        (payload) => {
          const nuevo = payload.new as { direccion: string };
          if (nuevo.direccion === "entrante") reproducirBeep();
          calcularPendientes();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversaciones", filter: `cuenta_id=eq.${cuentaId}` },
        () => calcularPendientes(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuentaId]);

  if (pendientes === 0) return null;

  return (
    <span
      className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white"
      style={{ background: "var(--color-ia)" }}
    >
      {pendientes > 99 ? "99+" : pendientes}
    </span>
  );
}
