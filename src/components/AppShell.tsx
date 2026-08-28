"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { LogoutButton } from "@/components/LogoutButton";
import {
  IconDashboard,
  IconChat,
  IconUser,
  IconDoc,
  IconCalendar,
  IconMegaphone,
  IconTag,
  IconBraces,
  IconUsers,
  IconBriefcase,
  IconRobot,
  IconGear,
} from "@/components/icons";

type ItemNav = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
  disponible: boolean;
};

const NAV_SUPER_ADMIN: ItemNav[] = [
  { href: "/", label: "Sub-cuentas", icon: IconBriefcase, disponible: true },
  { href: "/configuracion", label: "Configuración", icon: IconGear, disponible: true },
];

const NAV_TENANT: ItemNav[] = [
  { href: "/dashboard", label: "Dashboard", icon: IconDashboard, disponible: true },
  { href: "/conversaciones", label: "Conversaciones", icon: IconChat, disponible: true },
  { href: "/contactos", label: "Contactos", icon: IconUser, disponible: true },
  { href: "/plantillas", label: "Plantillas", icon: IconDoc, disponible: true },
  { href: "/calendarios", label: "Calendarios", icon: IconCalendar, disponible: false },
  { href: "/campanas", label: "Campañas", icon: IconMegaphone, disponible: true },
  { href: "/etiquetas", label: "Etiquetas", icon: IconTag, disponible: true },
  { href: "/variables", label: "Variables", icon: IconBraces, disponible: true },
  { href: "/usuarios", label: "Usuarios", icon: IconUsers, disponible: true },
  { href: "/profesionales", label: "Profesionales", icon: IconBriefcase, disponible: false },
  { href: "/agente-ia", label: "Agente IA", icon: IconRobot, disponible: true },
  { href: "/configuracion", label: "Configuración", icon: IconGear, disponible: false },
];

export function AppShell({
  children,
  email,
  role,
}: {
  children: ReactNode;
  email?: string;
  role?: "super_admin" | "admin" | "agente";
}) {
  const pathname = usePathname();
  const nav = role === "super_admin" ? NAV_SUPER_ADMIN : NAV_TENANT;

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--color-borde)] bg-[var(--color-bg-elevada)]">
        <div className="border-b border-[var(--color-borde)] p-5">
          <Logo tamaño="sm" />
          <p className="mt-1 text-xs text-[var(--color-texto-mute)]">Administración</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {nav.map((item) => {
            const activo = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
            const Icono = item.icon;

            if (!item.disponible) {
              return (
                <span
                  key={item.href}
                  title="Próximamente"
                  className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-texto-mute)] opacity-50"
                >
                  <Icono />
                  {item.label}
                </span>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                style={
                  activo
                    ? { background: "var(--color-marca)", color: "var(--color-accion-fg)" }
                    : { color: "var(--color-texto)" }
                }
              >
                <Icono />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-[var(--color-borde)] p-4">
          {email && (
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ background: "var(--color-marca)" }}
              >
                {email[0]?.toUpperCase()}
              </div>
              <span className="truncate text-sm text-[var(--color-texto-mute)]">{email}</span>
            </div>
          )}
          <ThemeSwitcher />
          <LogoutButton />
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto p-8">{children}</main>
    </div>
  );
}
