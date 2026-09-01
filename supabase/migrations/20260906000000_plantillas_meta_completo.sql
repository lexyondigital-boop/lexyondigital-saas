-- Convierte "Plantillas" de un registro interno a un asistente que crea y
-- somete plantillas de verdad a la Graph API de Meta. Agrega todos los
-- campos del asistente (encabezado, footer, medios, botones, carrusel,
-- webhook propio, etiquetas de envío y etapa de pipeline destino).

alter table public.templates
  add column meta_template_id text,
  add column categoria text not null default 'MARKETING'
    check (categoria in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  add column cuenta_whatsapp_id uuid references public.cuentas_whatsapp(id) on delete set null,
  add column header_tipo text not null default 'ninguno'
    check (header_tipo in ('ninguno', 'texto', 'imagen', 'video', 'documento')),
  add column header_texto text,
  add column header_media_url text,
  add column header_media_handle text,
  add column footer_texto text,
  add column botones jsonb not null default '[]',
  add column usa_carrusel boolean not null default false,
  add column tarjetas jsonb not null default '[]',
  add column webhook_url text,
  add column webhook_headers jsonb not null default '{}',
  add column etiquetas_envio text[] not null default '{}',
  add column etapa_destino_id uuid references public.etapas_pipeline(id) on delete set null,
  add column error_meta text,
  add column enviado_a_meta_en timestamptz;

-- Meta también puede pausar/deshabilitar una plantilla ya aprobada (baja
-- calidad, quejas de usuarios) -- son estados distintos de "rechazada" y el
-- usuario necesita distinguirlos para saber por qué dejó de enviarse.
alter table public.templates drop constraint templates_status_check;
alter table public.templates add constraint templates_status_check
  check (status in ('pending', 'approved', 'rejected', 'paused', 'disabled'));

create index templates_meta_template_id_idx on public.templates (meta_template_id);

-- Bucket público para los medios de encabezado/carrusel -- mismo patrón que
-- agente-documentos: ruta con uuid random, no adivinable.
insert into storage.buckets (id, name, public)
values ('plantillas-media', 'plantillas-media', true)
on conflict (id) do nothing;
