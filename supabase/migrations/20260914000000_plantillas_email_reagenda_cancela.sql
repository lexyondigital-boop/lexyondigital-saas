-- Amplía los tipos de plantillas_email para poder mandar un correo también
-- al reagendar o cancelar una cita (antes solo existía confirmacion_cita).
alter table public.plantillas_email drop constraint plantillas_email_tipo_check;
alter table public.plantillas_email add constraint plantillas_email_tipo_check
  check (tipo in ('confirmacion_cita', 'reagendamiento_cita', 'cancelacion_cita', 'campana'));
