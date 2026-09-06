-- Marca de "cuándo se tocó por última vez la etiqueta de este contacto" --
-- se usa para hundir su conversación al fondo de la lista de
-- Conversaciones cuando lo último que pasó fue un cambio de etiqueta (no
-- un mensaje nuevo). Ver src/lib/etiquetas-contacto.ts.
alter table public.contactos add column etiquetas_actualizadas_en timestamptz;
