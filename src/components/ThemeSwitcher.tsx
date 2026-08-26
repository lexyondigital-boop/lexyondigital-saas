"use client";

import { useTema, type Tema } from "@/context/ThemeContext";

const OPCIONES: { value: Tema; label: string }[] = [
  { value: "negro", label: "Negro" },
  { value: "tornasol-oscuro", label: "Tornasol oscuro (ciruela)" },
  { value: "tornasol-claro", label: "Tornasol blanco" },
];

export function ThemeSwitcher() {
  const { tema, setTema } = useTema();

  return (
    <select
      value={tema}
      onChange={(e) => setTema(e.target.value as Tema)}
      aria-label="Tema de la interfaz"
      className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-tarjeta)] px-3 py-1.5 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
    >
      {OPCIONES.map((op) => (
        <option key={op.value} value={op.value}>
          {op.label}
        </option>
      ))}
    </select>
  );
}
