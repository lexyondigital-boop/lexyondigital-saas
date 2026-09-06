-- Fase 5 del módulo "Agentes de Voz": el Copyscript pasa de ser solo texto de
-- referencia a controlar de verdad el agente de Retell que hace la llamada --
-- o, si la cuenta lo prefiere, se puede usar un agente que ya configuraron
-- directamente en Retell.

alter table public.plantillas_voz
  add column if not exists modo_agente text not null default 'generado'
    check (modo_agente in ('generado', 'retell_propio')),
  add column if not exists retell_agent_id text,
  add column if not exists retell_llm_id text,
  add column if not exists retell_voice_id text,
  add column if not exists retell_sincronizado_en timestamptz;
