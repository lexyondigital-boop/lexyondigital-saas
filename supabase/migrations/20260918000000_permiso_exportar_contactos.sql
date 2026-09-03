insert into public.permisos_catalogo (clave, nombre, descripcion, categoria) values
  ('export_contacts', 'Exportar contactos', 'Descargar la tabla de contactos como CSV', 'contactos')
on conflict (clave) do nothing;
