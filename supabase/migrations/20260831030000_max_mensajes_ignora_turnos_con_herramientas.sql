-- El tope de seguridad "max_mensajes" contaba TODAS las respuestas del bot
-- por igual, sin distinguir entre una conversación que da vueltas sin
-- avanzar y una que sí está progresando de verdad (consultando disponibilidad,
-- agendando, guardando datos del cliente). Eso causó una transferencia
-- automática justo cuando un cliente ya estaba a la mitad de agendar una cita
-- -- el conteo llegó al tope con puras respuestas de FAQ antes de ni siquiera
-- empezar a agendar, y cortó la conversación en el peor momento.
--
-- Ahora se marca si una respuesta del agente usó alguna herramienta (agenda,
-- guardar datos, etc.) y esas respuestas dejan de contar para el tope -- el
-- corte automático solo debe aplicar cuando el agente está estancado
-- (respondiendo sin avanzar), no cuando está progresando en un trámite real.

alter table public.mensajes
  add column uso_herramientas boolean not null default false;
