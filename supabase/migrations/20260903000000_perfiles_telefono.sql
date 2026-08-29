-- Teléfono del usuario (no confundir con contactos.telefono, que es del
-- WhatsApp del cliente final). Nullable en base de datos para no romper
-- perfiles existentes; se exige obligatorio en el formulario de alta.

alter table public.perfiles add column telefono text;
