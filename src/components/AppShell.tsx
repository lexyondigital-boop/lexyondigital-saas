"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificacionesConversaciones } from "@/components/NotificacionesConversaciones";
import { NotificacionesPipeline } from "@/components/NotificacionesPipeline";
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
  IconPipeline,
} from "@/components/icons";

type ItemNav = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
  disponible: boolean;
  requiere?: string;
};

const NAV_SUPER_ADMIN: ItemNav[] = [
  { href: "/", label: "Sub-cuentas", icon: IconBriefcase, disponible: true },
  { href: "/configuracion", label: "Configuración", icon: IconGear, disponible: true },
];

const NAV_TENANT: ItemNav[] = [
  { href: "/dashboard", label: "Dashboard", icon: IconDashboard, disponible: true },
  { href: "/conversaciones", label: "Conversaciones", icon: IconChat, disponible: true, requiere: "view_conversations" },
  { href: "/contactos", label: "Contactos", icon: IconUser, disponible: true, requiere: "view_contacts" },
  { href: "/pipeline", label: "Pipeline", icon: IconPipeline, disponible: true, requiere: "view_pipeline" },
  { href: "/plantillas", label: "Plantillas", icon: IconDoc, disponible: true, requiere: "view_templates" },
  { href: "/calendarios", label: "Calendarios", icon: IconCalendar, disponible: true, requiere: "view_appointments" },
  { href: "/campanas", label: "Campañas", icon: IconMegaphone, disponible: true, requiere: "view_campaigns" },
  { href: "/etiquetas", label: "Etiquetas", icon: IconTag, disponible: true, requiere: "view_tags" },
  { href: "/variables", label: "Variables", icon: IconBraces, disponible: true, requiere: "view_variables" },
  { href: "/usuarios", label: "Usuarios", icon: IconUsers, disponible: true, requiere: "manage_users" },
  { href: "/profesionales", label: "Profesionales", icon: IconBriefcase, disponible: true, requiere: "view_professionals" },
  { href: "/agente-ia", label: "Agente IA", icon: IconRobot, disponible: true, requiere: "access_agent_ia" },
  { href: "/configuracion", label: "Configuración", icon: IconGear, disponible: true, requiere: "access_configuration" },
  { href: "/mi-perfil", label: "Mi perfil", icon: IconUser, disponible: true },
];

export function AppShell({
  children,
  email,
  role,
  permisos,
  cuentaId,
}: {
  children: ReactNode;
  email?: string;
  role?: "super_admin" | "admin" | "agente";
  permisos?: Record<string, boolean>;
  cuentaId?: string;
}) {
  const pathname = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [nombreCuenta, setNombreCuenta] = useState<string | null>(null);
  const nav = (role === "super_admin" ? NAV_SUPER_ADMIN : NAV_TENANT).filter(
    (item) => !item.requiere || permisos?.[item.requiere],
  );

  // El nombre del negocio (editable por el super admin en Sub-cuentas > General)
  // se muestra debajo del logo en vez del genérico "Administración" -- así
  // cada sub-cuenta ve su propio nombre, no el de la plataforma.
  useEffect(() => {
    if (role === "super_admin" || !cuentaId) {
      setNombreCuenta(null);
      return;
    }
    createClient()
      .from("cuentas")
      .select("nombre")
      .eq("id", cuentaId)
      .maybeSingle()
      .then(({ data }) => setNombreCuenta(data?.nombre ?? null));
  }, [role, cuentaId]);

  // El menú es un cajón deslizable solo en móvil -- en escritorio (md+) el
  // sidebar sigue fijo como siempre. Se cierra solo al cambiar de página.
  useEffect(() => {
    setMenuAbierto(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      {menuAbierto && (
        <div onClick={() => setMenuAbierto(false)} className="fixed inset-0 z-40 bg-black/40 md:hidden" aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full flex-col border-r border-[var(--color-borde)] bg-[var(--color-bg-elevada)] transition-transform duration-200 md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:translate-x-0 ${
          menuAbierto ? "translate-x-0" : ""
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-borde)] p-5">
          <div>
            <Logo tamaño="sm" />
            <p className="mt-1 truncate text-xs text-[var(--color-texto-mute)]">{nombreCuenta ?? "Administración"}</p>
          </div>
          <button
            onClick={() => setMenuAbierto(false)}
            aria-label="Cerrar menú"
            className="text-[var(--color-texto-mute)] hover:text-[var(--color-texto)] md:hidden"
          >
            ✕
          </button>
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
                {item.href === "/conversaciones" && cuentaId && <NotificacionesConversaciones cuentaId={cuentaId} />}
                {item.href === "/pipeline" && cuentaId && <NotificacionesPipeline cuentaId={cuentaId} />}
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

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[var(--color-borde)] bg-[var(--color-bg-elevada)] p-4 md:hidden">
          <Logo tamaño="sm" />
          <button
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir menú"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-borde)] text-[var(--color-texto)]"
          >
            <span className="text-lg leading-none">☰</span>
          </button>
        </div>

        <main className="min-w-0 flex-1 overflow-x-auto p-4 sm:p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
