-- Fase 3 del módulo "Agentes de Voz": permiso para ver el panel nuevo
-- (tarjetas de categoría + resultados/estadísticas de llamadas). Separado
-- de manage_plantillas_voz, que sigue gatiando solo la creación/edición
-- de plantillas de voz.

insert into public.permisos_catalogo (clave, nombre, descripcion, categoria) values
  ('view_agentes_voz', 'Ver Agentes de Voz', 'Ver el panel de Agentes de Voz: categorías, resultados y estadísticas de llamadas', 'agentes_voz')
on conflict (clave) do nothing;
