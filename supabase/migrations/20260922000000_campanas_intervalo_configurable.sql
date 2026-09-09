-- El cron de campañas avanzaba siempre exactamente 1 contacto por minuto
-- (el propio ritmo del cron, sin forma de espaciar más) -- para cobranza,
-- Meta puede penalizar el envío de plantillas de marketing a audiencia fría
-- con el error 131049 ("healthy ecosystem engagement"), y espaciar más los
-- envíos es una de las mitigaciones. intervalo_minutos permite que cada
-- campaña defina cada cuántos minutos avanza (por defecto 1, o sea el
-- comportamiento de siempre). procesado_at marca cuándo se intentó cada
-- contacto (haya salido bien o mal) para poder calcular ese espaciado.
alter table public.campanas add column if not exists intervalo_minutos integer not null default 1
  check (intervalo_minutos >= 1);

alter table public.campana_contactos add column if not exists procesado_at timestamptz;
