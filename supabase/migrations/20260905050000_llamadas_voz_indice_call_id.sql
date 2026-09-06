-- Fase 4 del módulo "Agentes de Voz": el webhook de Retell busca la fila a
-- actualizar por retell_call_id -- necesita un índice para no ir de tabla
-- completa cada vez.

create unique index if not exists llamadas_voz_retell_call_id_idx
  on public.llamadas_voz (retell_call_id);
