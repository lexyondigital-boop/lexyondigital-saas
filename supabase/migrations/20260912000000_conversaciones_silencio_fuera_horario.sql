-- El agente mandaba el mensaje de fuera de horario en cada mensaje nuevo del
-- contacto mientras siguiera fuera de horario, en vez de avisar una vez y
-- quedarse callado. Este flag distingue ese silencio (temporal, se levanta
-- solo cuando el contacto vuelve a escribir ya dentro de horario) del
-- apagado permanente de agente_ia_activo (que sí requiere reactivación
-- manual, ej. tras transferir a un humano).
alter table public.conversaciones
  add column silenciado_fuera_horario boolean not null default false;
