-- Sincronización real (bidireccional) con Google Calendar vía push
-- notifications: Google nos avisa a un webhook cuando algo cambia en el
-- calendario del profesional, en vez de que solo nosotros empujemos cambios.
--
-- google_channel_id/resource_id: identifican el canal de notificaciones
-- suscrito con la Calendar API (events.watch).
-- google_channel_token: secreto que Google reenvía en cada notificación
-- (header X-Goog-Channel-Token) para verificar que de verdad viene del canal
-- que nosotros dimos de alta.
-- google_channel_expira_at: los canales de Google expiran (~1 semana);
-- un cron los renueva antes de que caduquen.
-- google_sync_token: token de sincronización incremental de la Calendar API
-- (events.list?syncToken=...) para traer solo lo que cambió.

alter table public.profesionales
  add column google_channel_id text,
  add column google_channel_resource_id text,
  add column google_channel_token text,
  add column google_channel_expira_at timestamptz,
  add column google_sync_token text;
