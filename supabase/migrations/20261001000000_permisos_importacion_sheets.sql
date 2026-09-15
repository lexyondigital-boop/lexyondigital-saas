-- Permisos de entrada y salida de contactos, separados por medio.
--
-- Hasta ahora "contactos" tenía view/create/edit/export pero no importar: la
-- carga masiva solo existía dentro de campañas y viajaba colgada de
-- edit_campaigns. Con Google Sheets sumando dos caminos más, la regla queda
-- explícita y administrable desde Usuarios.
--
-- Se separan CSV y Sheets a propósito: bajar un CSV deja los datos en la
-- máquina del usuario, mandarlos a Sheets los deposita en un Drive externo.
-- Son decisiones distintas y el admin puede querer conceder una y no la otra.
insert into public.permisos_catalogo (clave, nombre, descripcion, categoria) values
  ('import_contacts', 'Importar contactos (CSV)',
   'Cargar contactos masivamente desde un archivo CSV, en Contactos o al armar una campaña', 'contactos'),
  ('export_sheets', 'Exportar contactos a Google Sheets',
   'Crear una hoja de cálculo con los contactos en el Google Drive conectado', 'contactos'),
  ('import_sheets', 'Importar contactos desde Google Sheets',
   'Cargar contactos desde una hoja de cálculo del Google Drive conectado', 'contactos')
on conflict (clave) do nothing;

-- Ahora que hay dos exportaciones, el nombre del permiso que ya existía deja
-- de ser suficiente para distinguirlas. La clave no cambia, así que nada de
-- lo que la referencia se rompe.
update public.permisos_catalogo
   set nombre = 'Exportar contactos (CSV)'
 where clave = 'export_contacts';

-- Cargar contactos a una campaña pasa a exigir también import_contacts. Los
-- agentes que hoy pueden hacerlo lo conservan: sin esta concesión perderían
-- la función de un día para otro sin que nadie lo decidiera. admin y
-- super_admin tienen todo por defecto (ver obtenerPermisosEfectivos), así que
-- no necesitan fila.
insert into public.perfil_permisos (cuenta_id, perfil_id, permiso_clave, concedido)
select pp.cuenta_id, pp.perfil_id, 'import_contacts', true
  from public.perfil_permisos pp
  join public.perfiles p on p.id = pp.perfil_id
 where pp.permiso_clave = 'edit_campaigns'
   and pp.concedido is true
   and p.rol = 'agente'
on conflict (perfil_id, permiso_clave) do nothing;
