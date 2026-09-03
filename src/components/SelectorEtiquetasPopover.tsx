"use client";

import { useEffect, useRef, useState } from "react";

export type EtiquetaCatalogo = { id: string; nombre: string; color: string };

export function ChipMini({ nombre, color }: { nombre: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {nombre}
    </span>
  );
}

// Popover chico para agregar/quitar etiquetas de un contacto sin salir de
// donde se esté (tabla de contactos, encabezado de conversación, etc.) --
// mismo patrón que ya usa EtiquetaYEtapaContacto en ConversacionesView.tsx,
// extraído aquí para reusarlo sin tocar ese componente que ya funciona.
export function SelectorEtiquetasPopover({
  etiquetas,
  catalogo,
  onCambio,
}: {
  etiquetas: string[];
  catalogo: EtiquetaCatalogo[];
  onCambio: (nuevas: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  function alternar(nombre: string) {
    const nuevas = etiquetas.includes(nombre) ? etiquetas.filter((e) => e !== nombre) : [...etiquetas, nombre];
    onCambio(nuevas);
  }

  // Un contacto puede traer una etiqueta que ya no existe en el catálogo
  // (ej. se aplicó desde una plantilla y luego se borró del catálogo) --
  // sin esto no había forma de quitarla, porque el catálogo no la lista.
  const huerfanas = etiquetas.filter((nombre) => !catalogo.some((c) => c.nombre === nombre));

  return (
    <div className="relative" ref={popoverRef}>
      <button type="button" onClick={() => setAbierto((v) => !v)} className="flex flex-wrap items-center gap-1">
        {etiquetas.length === 0 ? (
          <span className="text-xs text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">+ Etiqueta</span>
        ) : (
          etiquetas.map((nombre) => {
            const cat = catalogo.find((c) => c.nombre === nombre);
            return <ChipMini key={nombre} nombre={nombre} color={cat?.color ?? "#8b5cf6"} />;
          })
        )}
      </button>
      {abierto && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-2 shadow-lg">
          {catalogo.length === 0 && huerfanas.length === 0 ? (
            <p className="px-1 py-1 text-xs text-[var(--color-texto-mute)]">Todavía no hay etiquetas creadas.</p>
          ) : (
            <>
              {catalogo.map((et) => (
                <label key={et.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-[var(--color-bg-elevada)]">
                  <input type="checkbox" checked={etiquetas.includes(et.nombre)} onChange={() => alternar(et.nombre)} />
                  <ChipMini nombre={et.nombre} color={et.color} />
                </label>
              ))}
              {huerfanas.map((nombre) => (
                <label key={nombre} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-[var(--color-bg-elevada)]">
                  <input type="checkbox" checked onChange={() => alternar(nombre)} />
                  <ChipMini nombre={nombre} color="#8b5cf6" />
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
