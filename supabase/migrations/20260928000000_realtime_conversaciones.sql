-- La esferita de "pendientes" junto a Conversaciones (NotificacionesConversaciones)
-- también escucha UPDATE en conversaciones (ej. cuando ultimo_visto_en cambia
-- desde otra pestaña/sesión) pero esa tabla nunca se agregó a la publicación
-- de Realtime -- solo mensajes la tenía (ver 20260828000000_realtime_mensajes.sql).
do $$
begin
  execute 'alter publication supabase_realtime add table public.conversaciones';
exception when duplicate_object then
  null;
end $$;
