-- Agentes de Voz: qué Variables (campos_personalizados) debe preguntar y
-- guardar el agente durante la llamada, vía la tool extract_dynamic_variable
-- de Retell. Distinto de {{clave}} en el Copyscript, que solo lee un dato ya
-- conocido del contacto (sustitución vía retell_llm_dynamic_variables).

alter table public.plantillas_voz
  add column if not exists retell_variables_a_capturar text[] not null default '{}';
