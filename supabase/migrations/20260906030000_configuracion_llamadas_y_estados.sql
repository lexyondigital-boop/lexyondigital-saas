-- Agentes de Voz: opciones de "Configuración de llamadas" de Retell (IVR,
-- pantalla de llamadas iOS/Android, DTMF, silencio, duración máxima,
-- duración del timbre) y estados granulares para llamadas que no llegaron a
-- conectar con una persona (buzón de voz, rechazada, no contestó) en vez del
-- genérico "sin_respuesta".

alter table public.llamadas_voz drop constraint if exists llamadas_voz_status_check;
alter table public.llamadas_voz add constraint llamadas_voz_status_check
  check (status in ('en_progreso','completada','fallida','sin_respuesta','buzon','rechazada','no_contesto'));

alter table public.plantillas_voz
  add column if not exists retell_colgar_ivr boolean not null default true,
  add column if not exists retell_pantalla_llamadas boolean not null default false,
  add column if not exists retell_dtmf_activo boolean not null default false,
  add column if not exists retell_dtmf_timeout_ms integer not null default 2500,
  add column if not exists retell_dtmf_clave_terminacion text,
  add column if not exists retell_dtmf_limite_digitos integer,
  add column if not exists retell_fin_silencio_ms integer not null default 600000,
  add column if not exists retell_duracion_maxima_ms integer not null default 3600000,
  add column if not exists retell_duracion_anillo_ms integer not null default 30000;

alter table public.plantillas_voz drop constraint if exists plantillas_voz_dtmf_clave_check;
alter table public.plantillas_voz add constraint plantillas_voz_dtmf_clave_check check (
  retell_dtmf_clave_terminacion is null or
  retell_dtmf_clave_terminacion in ('0','1','2','3','4','5','6','7','8','9','#','*')
);
