-- Campañas: nuevo canal "voz" -- las campañas de llamadas ahora también
-- abren/reusan una conversación por contacto, igual que WhatsApp y correo.

alter table public.campanas drop constraint if exists campanas_canal_check;
alter table public.campanas add constraint campanas_canal_check check (canal in ('whatsapp', 'correo', 'voz'));
alter table public.campanas add column if not exists plantilla_voz_id uuid references public.plantillas_voz (id) on delete set null;
