-- Guarda el diseño de bloques de Unlayer (el editor visual estilo Topol)
-- por separado de `cuerpo_html`. `cuerpo_html` sigue siendo el HTML final
-- que usa el envío real (reemplazarVariablesEmail no cambia); este JSON
-- solo sirve para poder reabrir el diseño en el editor visual más tarde.
-- Plantillas existentes (predeterminadas / generadas con IA) quedan con
-- diseno_json en null y se siguen editando como HTML crudo.
alter table public.plantillas_email add column diseno_json jsonb;
