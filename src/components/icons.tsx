type IconProps = { className?: string };

const base = "h-[18px] w-[18px]";
const props = (className?: string) => ({
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: className ?? base,
});

export function IconDashboard({ className }: IconProps) {
  return (
    <svg {...props(className)}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="12" width="8" height="9" rx="1.5" />
      <rect x="3" y="15" width="8" height="6" rx="1.5" />
    </svg>
  );
}

export function IconChat({ className }: IconProps) {
  return (
    <svg {...props(className)}>
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.4-.7L3 21l1.7-5.1A8.5 8.5 0 1 1 21 11.5Z" />
    </svg>
  );
}

export function IconUser({ className }: IconProps) {
  return (
    <svg {...props(className)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  );
}

export function IconDoc({ className }: IconProps) {
  return (
    <svg {...props(className)}>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
      <path d="M9.5 12.5h5M9.5 16h5" />
    </svg>
  );
}

export function IconCalendar({ className }: IconProps) {
  return (
    <svg {...props(className)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function IconMegaphone({ className }: IconProps) {
  return (
    <svg {...props(className)}>
      <path d="M3 11v2a1 1 0 0 0 1 1h1l2 6h2l-1-6h2l8 4V6l-8 4H5a1 1 0 0 0-1 1Z" />
    </svg>
  );
}

export function IconTag({ className }: IconProps) {
  return (
    <svg {...props(className)}>
      <path d="M11 3 3 11v3l7 7 10-10V3Z" />
      <circle cx="9.5" cy="8.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconBraces({ className }: IconProps) {
  return (
    <svg {...props(className)}>
      <path d="M8 4c-2 0-3 1-3 3v3c0 1-.7 2-2 2 1.3 0 2 1 2 2v3c0 2 1 3 3 3" />
      <path d="M16 4c2 0 3 1 3 3v3c0 1 .7 2 2 2-1.3 0-2 1-2 2v3c0 2-1 3-3 3" />
    </svg>
  );
}

export function IconUsers({ className }: IconProps) {
  return (
    <svg {...props(className)}>
      <circle cx="8.5" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.4 2.9-5.5 6-5.5s6 2.1 6 5.5" />
      <path d="M15.5 5.2A3.2 3.2 0 0 1 16.7 11.4" />
      <path d="M15.5 14.7c2.6.3 4.9 2.1 5 5.3" />
    </svg>
  );
}

export function IconBriefcase({ className }: IconProps) {
  return (
    <svg {...props(className)}>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5" />
      <path d="M3 12.5h18" />
    </svg>
  );
}

export function IconRobot({ className }: IconProps) {
  return (
    <svg {...props(className)}>
      <rect x="4" y="8" width="16" height="11" rx="2.5" />
      <path d="M12 8V4M9 4h6" />
      <circle cx="9" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
      <path d="M9 17h6" />
    </svg>
  );
}

export function IconGear({ className }: IconProps) {
  return (
    <svg {...props(className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.5-2-3.4-2.3.6a7.3 7.3 0 0 0-2.6-1.5L14 2h-4l-.4 2.7a7.3 7.3 0 0 0-2.6 1.5l-2.3-.6-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3L2.7 15l2 3.4 2.3-.6a7.3 7.3 0 0 0 2.6 1.5L10 22h4l.4-2.7a7.3 7.3 0 0 0 2.6-1.5l2.3.6 2-3.4Z" />
    </svg>
  );
}
