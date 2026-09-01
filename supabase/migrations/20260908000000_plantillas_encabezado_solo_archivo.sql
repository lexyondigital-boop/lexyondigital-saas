-- Meta no permite que un HEADER de plantilla sea texto Y medio a la vez --
-- son mutuamente excluyentes en su API. Se decidió que el "título" (ej.
-- "FELICIDADES GANASTE UNA PROMOCION") se escriba como primera línea en
-- negritas dentro del Cuerpo del Mensaje en vez de ser un componente HEADER
-- de texto aparte -- así "Archivo" (imagen/video/documento) queda siempre
-- independiente y sin conflicto. Se quita la opción de header de texto.

alter table public.templates drop column header_texto;
alter table public.templates drop column header_texto_ejemplo;
alter table public.templates drop column header_variable_clave;

alter table public.templates drop constraint templates_header_tipo_check;
alter table public.templates alter column header_tipo set default 'ninguno';
alter table public.templates add constraint templates_header_tipo_check
  check (header_tipo in ('ninguno', 'imagen', 'video', 'documento'));
