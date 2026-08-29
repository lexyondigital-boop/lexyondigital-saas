"use client";

import { useEffect, useState } from "react";

type Pais = { code: string; nombre: string; bandera: string; prefijo: string };

// El prefijo de México es "521" (52 + 1) y no solo "52": es lo que espera la
// API de WhatsApp Business para números mexicanos, aunque el estándar E.164
// ya no lleve ese "1" — si se manda solo "52" los mensajes fallan.
export const PAISES_TELEFONO: Pais[] = [
  { code: "MX", nombre: "México", bandera: "🇲🇽", prefijo: "521" },
  { code: "US", nombre: "Estados Unidos", bandera: "🇺🇸", prefijo: "1" },
  { code: "CA", nombre: "Canadá", bandera: "🇨🇦", prefijo: "1" },
  { code: "GT", nombre: "Guatemala", bandera: "🇬🇹", prefijo: "502" },
  { code: "BZ", nombre: "Belice", bandera: "🇧🇿", prefijo: "501" },
  { code: "SV", nombre: "El Salvador", bandera: "🇸🇻", prefijo: "503" },
  { code: "HN", nombre: "Honduras", bandera: "🇭🇳", prefijo: "504" },
  { code: "NI", nombre: "Nicaragua", bandera: "🇳🇮", prefijo: "505" },
  { code: "CR", nombre: "Costa Rica", bandera: "🇨🇷", prefijo: "506" },
  { code: "PA", nombre: "Panamá", bandera: "🇵🇦", prefijo: "507" },
  { code: "CO", nombre: "Colombia", bandera: "🇨🇴", prefijo: "57" },
  { code: "VE", nombre: "Venezuela", bandera: "🇻🇪", prefijo: "58" },
  { code: "EC", nombre: "Ecuador", bandera: "🇪🇨", prefijo: "593" },
  { code: "PE", nombre: "Perú", bandera: "🇵🇪", prefijo: "51" },
  { code: "BO", nombre: "Bolivia", bandera: "🇧🇴", prefijo: "591" },
  { code: "CL", nombre: "Chile", bandera: "🇨🇱", prefijo: "56" },
  { code: "AR", nombre: "Argentina", bandera: "🇦🇷", prefijo: "54" },
  { code: "PY", nombre: "Paraguay", bandera: "🇵🇾", prefijo: "595" },
  { code: "UY", nombre: "Uruguay", bandera: "🇺🇾", prefijo: "598" },
  { code: "DO", nombre: "República Dominicana", bandera: "🇩🇴", prefijo: "1" },
  { code: "ES", nombre: "España", bandera: "🇪🇸", prefijo: "34" },
  { code: "BR", nombre: "Brasil", bandera: "🇧🇷", prefijo: "55" },
];

// Dado un número completo ya guardado (con o sin prefijo), intenta separar
// país + número local para poder editarlo. Si no reconoce ningún prefijo con
// un resto de longitud razonable, lo deja todo como número local bajo México
// (el mercado por default) para que quede editable a mano.
function dividirTelefono(valor: string): { paisCode: string; local: string } {
  const soloDigitos = (valor || "").replace(/\D/g, "");
  if (!soloDigitos) return { paisCode: "MX", local: "" };
  // Un número de 10 dígitos es justo un local mexicano sin prefijo (el caso
  // más común al buscar/capturar) — tratarlo así evita falsos positivos como
  // leer los primeros dígitos de un número local como si fueran un prefijo
  // de otro país (p. ej. "55" al inicio también es el prefijo de Brasil).
  if (soloDigitos.length <= 10) return { paisCode: "MX", local: soloDigitos };

  const candidatos = [...PAISES_TELEFONO].sort((a, b) => b.prefijo.length - a.prefijo.length);
  for (const pais of candidatos) {
    if (soloDigitos.startsWith(pais.prefijo)) {
      const resto = soloDigitos.slice(pais.prefijo.length);
      if (resto.length >= 8 && resto.length <= 11) return { paisCode: pais.code, local: resto };
    }
  }
  return { paisCode: "MX", local: soloDigitos };
}

export function CampoTelefono({
  value,
  onChange,
  required,
  label = "Teléfono",
  hint,
}: {
  value: string;
  onChange: (valorCompleto: string) => void;
  required?: boolean;
  label?: string;
  hint?: string;
}) {
  const [paisCode, setPaisCode] = useState(() => dividirTelefono(value).paisCode);
  const [local, setLocal] = useState(() => dividirTelefono(value).local);

  useEffect(() => {
    const dividido = dividirTelefono(value);
    setPaisCode(dividido.paisCode);
    setLocal(dividido.local);
    // Solo cuando cambia el valor externo (p. ej. al cargar datos async);
    // las ediciones del usuario ya emiten hacia afuera, no necesitan volver.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function emitir(nuevoPaisCode: string, nuevoLocal: string) {
    const pais = PAISES_TELEFONO.find((p) => p.code === nuevoPaisCode) ?? PAISES_TELEFONO[0];
    const digitos = nuevoLocal.replace(/\D/g, "");
    onChange(digitos ? `${pais.prefijo}${digitos}` : "");
  }

  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-[var(--color-texto)]">{label}</span>
      <div className="flex gap-2">
        <select
          value={paisCode}
          onChange={(e) => {
            setPaisCode(e.target.value);
            emitir(e.target.value, local);
          }}
          className="w-[6.5rem] shrink-0 rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-2 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        >
          {PAISES_TELEFONO.map((p) => (
            <option key={p.code} value={p.code}>
              {p.bandera} +{p.prefijo}
            </option>
          ))}
        </select>
        <input
          required={required}
          type="tel"
          value={local}
          onChange={(e) => {
            const limpio = e.target.value.replace(/\D/g, "");
            setLocal(limpio);
            emitir(paisCode, limpio);
          }}
          placeholder="10 dígitos"
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
      </div>
      {hint && <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">{hint}</span>}
    </label>
  );
}
