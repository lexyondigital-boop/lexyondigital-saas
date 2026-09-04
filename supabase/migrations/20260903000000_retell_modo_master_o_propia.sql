-- Fase 1 del módulo "Agentes de Voz": cada cuenta elige si usa la API de
-- Retell de lexyondigital (incluida en el plan) o su propia cuenta de
-- Retell (DIY). La maestra se guarda en plataforma_secretos, igual que las
-- de OpenAI/Anthropic. El check de `clave` se reemplaza buscando su nombre
-- real en pg_constraint (en vez de asumirlo) porque Postgres no siempre usa
-- la convención <tabla>_<columna>_check.
do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'plataforma_secretos'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%clave%';

  if v_constraint_name is not null then
    execute format('alter table public.plataforma_secretos drop constraint %I', v_constraint_name);
  end if;

  alter table public.plataforma_secretos add constraint plataforma_secretos_clave_check
    check (clave in ('openai_api_key', 'anthropic_api_key', 'retell_api_key'));
end $$;

alter table public.cuentas_retell add column if not exists modo text not null default 'master' check (modo in ('master', 'propia'));
alter table public.cuentas_retell alter column api_key_cifrada drop not null;
