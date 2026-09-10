-- Se retira el sistema de "plantillas maestras" de Agentes de Voz: hoy las
-- 3 sub-cuentas reales ya usan su propia cuenta de Retell (cuentas_retell
-- modo = 'propia', con su propio numero_saliente), así que el mecanismo de
-- "elige una plantilla maestra como punto de partida" + número asignado por
-- plantilla no le sirve a ningún cliente actual y es la causa de la
-- confusión reportada. Ninguna sub-cuenta tiene plantilla_madre_id ni fila
-- en las tablas de asignación/ocultamiento (verificado antes de este drop),
-- así que no se pierde ningún dato en uso.
alter table public.plantillas_voz drop column if exists plantilla_madre_id;
drop table if exists public.plantillas_voz_maestras_numeros_asignados;
drop table if exists public.plantillas_voz_maestras_ocultas;
drop table if exists public.plantillas_voz_maestras;
