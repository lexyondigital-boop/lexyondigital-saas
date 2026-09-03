-- Permite que cada profesional active/desactive por separado el correo de
-- confirmación/reagendamiento/cancelación de SUS citas (antes era todo o
-- nada a nivel cuenta). Default true para no cambiar el comportamiento de
-- quien ya lo está usando.
alter table public.profesionales
  add column enviar_confirmacion_email boolean not null default true,
  add column enviar_reagendamiento_email boolean not null default true,
  add column enviar_cancelacion_email boolean not null default true;

-- Bucket para subir el logo del profesional como imagen (en vez de solo
-- pegar una URL externa) -- mismo patrón que whatsapp-media/
-- agente-documentos/plantillas-media: público porque la ruta lleva un UUID
-- no adivinable, subida siempre server-side con el cliente admin.
insert into storage.buckets (id, name, public) values ('profesionales-logos', 'profesionales-logos', true) on conflict (id) do nothing;
