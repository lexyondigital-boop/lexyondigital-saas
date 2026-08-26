import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { LogoutButton } from "@/components/LogoutButton";

const NAV = [{ href: "/", label: "Sub-cuentas" }];

export function AppShell({ children, email }: { children: ReactNode; email?: string }) {
  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--color-borde)] bg-[var(--color-bg-elevada)]">
        <div className="border-b border-[var(--color-borde)] p-5">
          <Logo tamaño="sm" />
          <p className="mt-1 text-xs text-[var(--color-texto-mute)]">Administración</p>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-accion-fg)]"
              style={{ background: "var(--color-marca)" }}
            >
              {item.label}
            </Link>
          ))}
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
