"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/Badge";

type CuentaWhatsapp = {
  numero_telefono: string | null;
  nombre_verificado: string | null;
  estado: "activo" | "inactivo" | "error";
  created_at: string;
};

export function ConfiguracionCuentaView() {
  const supabase = createClient();
  const [whatsapp, setWhatsapp] = useState<CuentaWhatsapp | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("cuentas_whatsapp")
        .select("numero_telefono, nombre_verificado, estado, created_at")
        .maybeSingle();
      setWhatsapp(data);
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--color-texto)]">Configuración</h1>
      <p className="mt-1 text-sm text-[var(--color-texto-mute)]">Estado de las integraciones de tu cuenta.</p>

      <div className="mt-5 max-w-md rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-texto)]">WhatsApp Business</h2>
        {cargando ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : !whatsapp ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Tu cuenta todavía no tiene WhatsApp conectado. Pide a Lexyondigital que lo configure.</p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-texto-mute)]">Estado</span>
              <Badge tono={whatsapp.estado === "activo" ? "en-vivo" : whatsapp.estado === "error" ? "aviso" : "mute"}>
                {whatsapp.estado === "activo" ? "Activo" : whatsapp.estado === "error" ? "Error" : "Inactivo"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-texto-mute)]">Número</span>
              <span className="text-[var(--color-texto)]">{whatsapp.numero_telefono ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-texto-mute)]">Nombre verificado</span>
              <span className="text-[var(--color-texto)]">{whatsapp.nombre_verificado ?? "—"}</span>
            </div>
          </div>
        )}
        <p className="mt-4 text-xs text-[var(--color-texto-mute)]">
          Las credenciales de WhatsApp las administra Lexyondigital por seguridad. Si necesitas reconectar o cambiar el número, contáctanos.
        </p>
      </div>
    </div>
  );
}
