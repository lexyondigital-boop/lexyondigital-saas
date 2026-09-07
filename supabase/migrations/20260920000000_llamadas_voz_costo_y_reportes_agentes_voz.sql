-- (1) Costo real de cada llamada de voz -- lo manda Retell en el webhook
-- de call_ended/call_analyzed (call_cost.combined_cost), hace falta
-- guardarlo para poder reportar consumo/minutos, hoy no existía la
-- columna. (2) Entidad "agentes_voz" en el módulo de Reportes (fuente:
-- llamadas_voz) más el concepto de "métrica": para las demás entidades
-- un reporte siempre cuenta filas, pero para agentes_voz también hace
-- falta poder SUMAR duración/costo -- por eso metrica es una columna
-- nueva, no una dimensión más.
-- Nota: costo_retell queda tal cual lo reporta Retell (call_cost.combined_cost)
-- -- no asumimos que sea centavos de dólar u otra unidad específica, por eso
-- el nombre no dice "centavos"/"usd".
alter table public.llamadas_voz add column if not exists costo_retell numeric;

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
    check (entidad in ('contactos', 'deals', 'campanas', 'conversaciones', 'agentes_voz'));

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
      'fecha_creacion', 'fecha_modificacion', 'campo_personalizado', 'plantilla', 'categoria'
    ));
end $$;

alter table public.reportes add column if not exists metrica text not null default 'llamadas'
  check (metrica in ('llamadas', 'minutos', 'costo'));
