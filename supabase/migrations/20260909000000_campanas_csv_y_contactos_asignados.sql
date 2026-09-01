-- Soporte para cargar contactos de una campaña por CSV (con normalización
-- de teléfono y país), programar el envío para más tarde, y asignar cada
-- contacto a un usuario del equipo (no existía ningún "dueño" de contacto,
-- a diferencia de deals que ya tiene propietario_id).

alter table public.campanas
  add column programado_para timestamptz;

alter table public.contactos
  add column asignado_a uuid references public.perfiles(id) on delete set null;

create index contactos_asignado_a_idx on public.contactos (asignado_a);

-- campana_status ya es text libre (sin check constraint) -- se amplía en
-- código a pendiente/enviado/entregado/leido/respondio/fallido, no requiere
-- cambio de esquema aquí.
