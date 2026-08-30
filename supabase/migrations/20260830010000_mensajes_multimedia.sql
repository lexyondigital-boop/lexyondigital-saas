-- Soporte para recibir audio (con transcripción) e imágenes por WhatsApp.
-- Hasta ahora el webhook descartaba en silencio cualquier mensaje que no
-- fuera texto -- esto agrega dónde guardar el archivo descargado de Meta
-- (su URL temporal expira en minutos, así que se re-sube a Storage) y
-- habilita 'audio' como tipo de mensaje válido.

do $$
declare
  nombre_constraint text;
begin
  select conname into nombre_constraint
  from pg_constraint
  where conrelid = 'public.mensajes'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%tipo%';

  if nombre_constraint is not null then
    execute format('alter table public.mensajes drop constraint %I', nombre_constraint);
  end if;
end $$;

alter table public.mensajes
  add constraint mensajes_tipo_check check (tipo in ('texto', 'template', 'imagen', 'documento', 'audio'));

alter table public.mensajes
  add column media_url text,
  add column media_mime_type text;

-- Bucket público: la ruta de cada archivo lleva un uuid random (no
-- adivinable), mismo nivel de exposición que una URL de medios de WhatsApp.
-- Si más adelante se requiere acceso realmente privado, cambiar a bucket
-- privado + URLs firmadas generadas al leer los mensajes.
insert into storage.buckets (id, name, public)
values ('whatsapp-media', 'whatsapp-media', true)
on conflict (id) do nothing;
