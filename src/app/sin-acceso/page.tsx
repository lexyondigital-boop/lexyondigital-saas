import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";

export default function SinAccesoPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--color-bg)] px-4 text-center">
      <Logo />
      <div>
        <h1 className="text-lg font-semibold text-[var(--color-texto)]">Tu cuenta no está activa</h1>
        <p className="mt-2 max-w-sm text-sm text-[var(--color-texto-mute)]">
          Tu correo no tiene una cuenta configurada en la plataforma todavía. Contacta a tu administrador.
        </p>
      </div>
      <LogoutButton />
    </div>
  );
}
