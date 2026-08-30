-- max_mensajes contaba el total histórico de respuestas del agente en toda
-- la conversación, sin reiniciarse nunca -- una conversación de prueba muy
-- larga (o simplemente longeva) terminaba transfiriendo a un humano de
-- forma permanente aunque el cliente reactivara el agente, porque el
-- conteo seguía sumando desde el primer mensaje de siempre. Ahora se cuenta
-- solo desde la última vez que el agente se activó (al crear la
-- conversación, o al reactivarlo a mano después de una transferencia).

alter table public.conversaciones
  add column agente_activado_en timestamptz not null default now();
