-- Fase 7 del módulo "Agentes de Voz": el super-admin puede restringir por
-- sub-cuenta si puede usar la API maestra de Retell, la propia, o ambas; y
-- las plantillas ganan un arreglo de "funciones" (general_tools de Retell),
-- empezando por "fin_de_llamada" (end_call), activada por defecto.

alter table public.cuentas
  add column if not exists retell_permite_master boolean not null default true,
  add column if not exists retell_permite_propia boolean not null default true;

alter table public.plantillas_voz
  add column if not exists retell_funciones jsonb not null default
    '[{"type":"end_call","name":"fin_de_llamada","description":"Cuelga la llamada cuando la conversación haya terminado naturalmente o el cliente se despida."}]'::jsonb;
