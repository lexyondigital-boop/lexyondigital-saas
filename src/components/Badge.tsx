export function Badge({
  tono,
  children,
}: {
  tono: "marca" | "ia" | "en-vivo" | "mute" | "aviso";
  children: React.ReactNode;
}) {
  const color = {
    marca: "var(--color-marca)",
    ia: "var(--color-ia)",
    "en-vivo": "var(--color-en-vivo)",
    mute: "var(--color-texto-mute)",
    aviso: "var(--color-aviso)",
  }[tono];

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      {children}
    </span>
  );
}
