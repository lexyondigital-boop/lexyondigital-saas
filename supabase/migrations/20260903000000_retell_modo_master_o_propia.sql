-- Fase 1 del módulo "Agentes de Voz": cada cuenta elige si usa la API de
-- Retell de lexyondigital (incluida en el plan) o su propia cuenta de
-- Retell (DIY). La maestra se guarda en plataforma_secretos, igual que las
-- de OpenAI/Anthropic.
alter table public.plataforma_secretos drop constraint plataforma_secretos_clave_check;
alter table public.plataforma_secretos add constraint plataforma_secretos_clave_check
  check (clave in ('openai_api_key', 'anthropic_api_key', 'retell_api_key'));

alter table public.cuentas_retell add column modo text not null default 'master' check (modo in ('master', 'propia'));
alter table public.cuentas_retell alter column api_key_cifrada drop not null;
