-- Las etiquetas nunca tuvieron color propio (siempre se pintaban todas del
-- mismo morado fijo vía Badge tono="ia") -- se agrega un color configurable
-- por etiqueta, mismo patrón ya usado en equipos y etapas_pipeline.

alter table public.etiquetas
  add column color text not null default '#8b5cf6';
