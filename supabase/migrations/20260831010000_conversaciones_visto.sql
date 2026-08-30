-- Para el contador de conversaciones pendientes en la barra lateral: se
-- necesita saber si el último mensaje entrante de una conversación ya fue
-- visto por un humano. default now() en el backfill para no marcar como
-- "pendientes" de golpe todas las conversaciones que ya existían.

alter table public.conversaciones
  add column ultimo_visto_en timestamptz not null default now();
