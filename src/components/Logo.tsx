// Aproximación del isotipo + wordmark del PDF de marca (símbolo "L" con
// degradado + "Lexyon" en texto sólido + "Digital" en degradado). Si existe
// el archivo vectorial original del logo, reemplazar este componente por ese
// SVG exportado — esto es una reconstrucción visual, no el activo oficial.
export function Logo({ tamaño = "md" }: { tamaño?: "sm" | "md" }) {
  const alturaTexto = tamaño === "sm" ? "text-lg" : "text-2xl";
  const tamañoIcono = tamaño === "sm" ? 28 : 36;

  return (
    <div className="flex items-center gap-2.5">
      <svg width={tamañoIcono} height={tamañoIcono} viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="lexyon-gradiente" x1="0" y1="40" x2="40" y2="0">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="35%" stopColor="#ec4899" />
            <stop offset="70%" stopColor="#ffb020" />
            <stop offset="100%" stopColor="#35d6c4" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="10" fill="url(#lexyon-gradiente)" />
        <path d="M14 10v16a4 4 0 0 0 4 4h9" stroke="white" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      </svg>
      <span className={`${alturaTexto} font-bold text-[var(--color-texto)]`}>
        Lexyon
        <span
          style={{
            backgroundImage: "linear-gradient(90deg, #a855f7, #ec4899, #ffb020, #35d6c4)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Digital
        </span>
      </span>
    </div>
  );
}
