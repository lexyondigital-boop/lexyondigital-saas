-- Qué profesionales/calendarios puede consultar y gestionar el agente IA.
-- null = todos los profesionales activos de la cuenta (compatibilidad con
-- cuentas que ya tenían el agente funcionando antes de este selector).
-- Un arreglo (incluido vacío) = restricción explícita elegida en la
-- pantalla de Agente IA.
alter table public.agente_config
  add column profesionales_ids uuid[];
