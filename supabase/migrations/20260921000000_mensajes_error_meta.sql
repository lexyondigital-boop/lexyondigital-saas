-- Cuando WhatsApp reporta que un mensaje falló en la entrega (webhook de
-- estado), guardábamos el status "fallido" pero descartábamos el motivo
-- real que manda Meta (statuses[].errors) -- imposible diagnosticar
-- después por qué falló una tanda de una campaña. Se guarda tal cual.
alter table public.mensajes add column if not exists error_meta jsonb;
