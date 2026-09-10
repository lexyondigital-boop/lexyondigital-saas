-- Agentes de Voz: controla si la IA habla primero (con un mensaje de
-- bienvenida fijo) o si espera a que hable el usuario, vía el campo
-- begin_message de Retell.

alter table public.plantillas_voz
  add column if not exists retell_habla_primero boolean not null default false,
  add column if not exists retell_mensaje_bienvenida text;
