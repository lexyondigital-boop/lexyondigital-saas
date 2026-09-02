-- Marca por profesional (logo, color, redes sociales) para que cada doctor
-- de una clínica pueda personalizar los correos de cita con su propia
-- identidad, en vez de todos usar el diseño genérico de la cuenta.
alter table public.profesionales
  add column logo_url text,
  add column color_marca text,
  add column redes_sociales jsonb not null default '{}'::jsonb;
