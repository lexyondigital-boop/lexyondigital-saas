-- Hasta ahora "Documentos" solo guardaba un link externo que el agente ni
-- siquiera leía (el prompt solo recibía el nombre y la URL, nunca el
-- contenido). Esto agrega soporte real de dos fuentes de conocimiento:
--   1. PDF subido de verdad -- se sube a Storage y se extrae su texto al
--      momento de subirlo.
--   2. Página web del negocio -- se hace scraping de texto plano de la URL
--      indicada, con opción de refrescarlo después si el sitio cambia.
-- El texto extraído vive en contenido_extraido; desde ahí el runtime del
-- agente lo inyecta en el prompt (ver agente-ia-runtime.ts).

alter table public.agente_documentos
  add column tipo_fuente text not null default 'documento' check (tipo_fuente in ('documento', 'sitio_web')),
  add column storage_path text,
  add column contenido_extraido text,
  add column estado_extraccion text not null default 'pendiente' check (estado_extraccion in ('pendiente', 'listo', 'error')),
  add column error_extraccion text,
  add column actualizado_contenido_en timestamptz;

-- Los documentos que ya existían son links pegados a mano, nunca se leyó su
-- contenido -- se marcan en error (no "pendiente") para no dar a entender
-- que se van a procesar solos; el admin decide si los vuelve a subir como
-- PDF o los reemplaza por un sitio web conectado.
update public.agente_documentos
set estado_extraccion = 'error',
    error_extraccion = 'Agregado antes de esta actualización -- vuelve a subirlo como PDF o conéctalo como sitio web para que el agente pueda leerlo.'
where estado_extraccion = 'pendiente';

-- Bucket público: la ruta de cada archivo lleva un uuid random (no
-- adivinable), mismo nivel de exposición ya aceptado para whatsapp-media.
insert into storage.buckets (id, name, public)
values ('agente-documentos', 'agente-documentos', true)
on conflict (id) do nothing;
