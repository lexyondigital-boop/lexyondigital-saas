-- updated_at genérico vía trigger (en vez de que cada ruta de la app se
-- acuerde de tocarlo) para las tablas que el módulo de Reportes necesita
-- poder agrupar por "fecha de modificación": contactos, deals, campanas,
-- etapas_pipeline. Ninguna tenía updated_at hasta ahora.
create or replace function public.tocar_actualizado_en()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

alter table public.contactos add column updated_at timestamptz not null default now();
create trigger contactos_actualizado_en before update on public.contactos
  for each row execute function public.tocar_actualizado_en();

alter table public.deals add column updated_at timestamptz not null default now();
create trigger deals_actualizado_en before update on public.deals
  for each row execute function public.tocar_actualizado_en();

alter table public.campanas add column updated_at timestamptz not null default now();
create trigger campanas_actualizado_en before update on public.campanas
  for each row execute function public.tocar_actualizado_en();

alter table public.etapas_pipeline add column updated_at timestamptz not null default now();
create trigger etapas_pipeline_actualizado_en before update on public.etapas_pipeline
  for each row execute function public.tocar_actualizado_en();
