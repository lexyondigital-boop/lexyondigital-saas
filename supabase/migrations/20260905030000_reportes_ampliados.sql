-- Amplía el módulo de Reportes: (1) "conversaciones" como entidad nueva
-- (para reportar abiertas vs cerradas), (2) "campana_status" como
-- dimensión fija de contactos, (3) "campo_personalizado" como dimensión
-- que permite agrupar por CUALQUIER campo que el usuario haya creado en
-- Contactos (campos_personalizados), y (4) un filtro opcional por
-- etiqueta específica dentro de un reporte de contactos.
--
-- Los nombres de los check constraints se buscan en pg_constraint en vez
-- de asumirse, mismo patrón ya usado en 20260903000000_retell_modo_master_o_propia.sql.
do $$
declare
  v_constraint_entidad text;
  v_constraint_dimension text;
begin
  select con.conname into v_constraint_entidad
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public' and rel.relname = 'reportes' and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%entidad%';

  if v_constraint_entidad is not null then
    execute format('alter table public.reportes drop constraint %I', v_constraint_entidad);
  end if;

  alter table public.reportes add constraint reportes_entidad_check
    check (entidad in ('contactos', 'deals', 'campanas', 'conversaciones'));

  select con.conname into v_constraint_dimension
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public' and rel.relname = 'reportes' and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%dimension%';

  if v_constraint_dimension is not null then
    execute format('alter table public.reportes drop constraint %I', v_constraint_dimension);
  end if;

  alter table public.reportes add constraint reportes_dimension_check
    check (dimension in (
      'etapa_pipeline', 'etiqueta', 'asignado_a', 'canal_origen', 'status', 'campana_status',
      'fecha_creacion', 'fecha_modificacion', 'campo_personalizado'
    ));
end $$;

alter table public.reportes add column campo_personalizado_id uuid references public.campos_personalizados (id) on delete cascade;
