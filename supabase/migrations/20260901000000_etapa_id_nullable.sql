-- Antes, borrar una etapa que todavía tenía deals se bloqueaba con un error
-- pidiendo "mover los deals a otra etapa primero" -- pero si esa era la
-- única etapa configurada, no había a dónde moverlos, dejando la etapa
-- imposible de borrar. Ahora se permite borrarla igual: los deals que
-- estaban ahí se quedan sin etapa asignada (el admin ve una advertencia
-- explícita antes de confirmar, y el tablero muestra una columna "Sin etapa"
-- para esos casos).

alter table public.deals alter column etapa_id drop not null;

alter table public.deals drop constraint deals_etapa_id_fkey;
alter table public.deals add constraint deals_etapa_id_fkey
  foreign key (etapa_id) references public.etapas_pipeline(id) on delete set null;
