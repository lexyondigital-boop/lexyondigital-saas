-- Campos para la sección "Sub-cuentas" del portal: código legible,
-- slug único y giro de negocio (texto libre, descriptivo, no configura nada).

alter table public.cuentas
  add column codigo text unique,
  add column slug text unique,
  add column giro text;

create sequence if not exists public.cuentas_codigo_seq;

create or replace function public.generar_codigo_cuenta()
returns trigger
language plpgsql
as $$
begin
  if new.codigo is null then
    new.codigo := 'ACC-' || lpad(nextval('public.cuentas_codigo_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger trg_generar_codigo_cuenta
before insert on public.cuentas
for each row execute function public.generar_codigo_cuenta();

-- Teléfono del usuario (antes solo existía nombre).
alter table public.perfiles
  add column telefono text;
