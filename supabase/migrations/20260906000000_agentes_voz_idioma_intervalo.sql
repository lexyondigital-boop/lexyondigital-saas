-- Fase 6 del módulo "Agentes de Voz": el agente generado quedaba en inglés
-- por defecto (Retell no adivina el idioma del Copyscript) -- se agrega
-- idioma y detección de buzón de voz por plantilla, y un intervalo mínimo
-- entre llamadas al mismo contacto para evitar que se sienta como spam.

alter table public.plantillas_voz
  add column if not exists retell_idioma text not null default 'es-419',
  add column if not exists retell_colgar_buzon boolean not null default true;

alter table public.cuentas_retell
  add column if not exists intervalo_minimo_llamadas_minutos integer not null default 5
    check (intervalo_minimo_llamadas_minutos in (2, 5, 10));
