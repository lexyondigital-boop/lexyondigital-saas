-- Los checkboxes de permisos en Usuarios ya se guardaban en perfil_permisos,
-- pero ninguna pantalla los leía: cualquier agente autenticado veía y
-- entraba a todos los módulos sin importar lo que el admin marcara. Esta
-- migración solo completa el catálogo con las "ver" que faltaban
-- (plantillas, campañas, etiquetas, variables no tenían ninguna) — la
-- aplicación real de estos permisos va en el código de la app, no aquí.

insert into public.permisos_catalogo (clave, nombre, categoria) values
  ('view_templates', 'Ver plantillas', 'plantillas'),
  ('view_campaigns', 'Ver campañas', 'campanas'),
  ('view_tags', 'Ver etiquetas', 'etiquetas'),
  ('view_variables', 'Ver variables', 'variables');
