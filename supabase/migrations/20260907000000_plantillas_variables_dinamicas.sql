-- Permite que un {{n}} del cuerpo (o el único {{1}} del encabezado de texto)
-- se ligue a una variable real de "Variables" (campos_personalizados) en vez
-- de ser solo un valor de ejemplo fijo -- así al mandar una campaña, cada
-- contacto recibe su propio dato en vez de que el admin tenga que escribirlo
-- a mano cada vez. Paralelo a `variables` (los valores de ejemplo que exige
-- Meta para aprobar la plantilla), que ya existía.

alter table public.templates
  add column variables_mapeo text[] not null default '{}',
  add column header_texto_ejemplo text,
  add column header_variable_clave text;
