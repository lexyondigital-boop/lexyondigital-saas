-- Habilita Supabase Realtime para mensajes -- la bandeja de Conversaciones
-- del front se suscribe a INSERTs para reflejar mensajes entrantes sin
-- refrescar la página. Las tablas creadas por migración SQL cruda no se
-- agregan solas a la publicación (a diferencia de crearlas desde el editor
-- de Supabase Studio, que sí lo hace automáticamente).
do $$
begin
  execute 'alter publication supabase_realtime add table public.mensajes';
exception when duplicate_object then
  null;
end $$;
