-- Módulo de Proceso Comercial / Pipeline: etapas configurables, deals
-- (oportunidades) y tareas asociadas. El timeline de cada deal ("quién, qué,
-- cuándo") no crea una tabla nueva -- reutiliza logs_actividad con
-- recurso_tipo = 'deal', igual que ya se hace para usuarios/equipos/citas.

create table public.etapas_pipeline (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  nombre text not null,
  color text not null default '#8b5cf6',
  orden int not null,
  probabilidad_default int not null default 20 check (probabilidad_default between 0 and 100),
  es_ganada boolean not null default false,
  es_perdida boolean not null default false,
  created_at timestamptz not null default now(),
  unique (cuenta_id, nombre)
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  titulo text not null,
  valor numeric(12,2) not null default 0,
  contacto_id uuid references public.contactos(id) on delete set null,
  etapa_id uuid not null references public.etapas_pipeline(id),
  propietario_id uuid references public.perfiles(id) on delete set null,
  estado text not null default 'abierto' check (estado in ('abierto', 'ganado', 'perdido')),
  probabilidad_manual int check (probabilidad_manual between 0 and 100),
  fecha_cierre_estimada date,
  motivo_cierre text,
  ultima_actividad_en timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index deals_cuenta_etapa_idx on public.deals (cuenta_id, etapa_id);
create index deals_cuenta_propietario_idx on public.deals (cuenta_id, propietario_id);
create index deals_cuenta_estado_idx on public.deals (cuenta_id, estado);

create table public.tareas (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  tipo text not null check (tipo in ('llamada', 'email', 'reunion', 'otro')),
  titulo text not null,
  descripcion text,
  fecha_vencimiento timestamptz not null,
  asignado_a uuid references public.perfiles(id) on delete set null,
  completada boolean not null default false,
  completada_en timestamptz,
  created_at timestamptz not null default now()
);
create index tareas_cuenta_pendientes_idx on public.tareas (cuenta_id, completada, fecha_vencimiento);
create index tareas_deal_idx on public.tareas (deal_id);

-- ============================================================
-- RLS -- mismo patrón "por cuenta" que agente_documentos/agente_faqs: visible
-- para cualquier miembro de la cuenta, el permiso granular (view_pipeline /
-- manage_deals / manage_pipeline_config) se aplica en el código de la app,
-- no aquí (mismo criterio ya documentado en 20260904000000_permisos_faltantes.sql).
-- ============================================================

alter table public.etapas_pipeline enable row level security;
alter table public.deals enable row level security;
alter table public.tareas enable row level security;

create policy "etapas_pipeline: por cuenta" on public.etapas_pipeline
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "deals: por cuenta" on public.deals
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "tareas: por cuenta" on public.tareas
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

-- ============================================================
-- Permisos granulares nuevos
-- ============================================================

insert into public.permisos_catalogo (clave, nombre, descripcion, categoria) values
  ('view_pipeline', 'Ver pipeline', 'Ver el tablero de proceso comercial, deals y tareas', 'pipeline'),
  ('manage_deals', 'Gestionar deals', 'Crear, editar, mover, asignar y cerrar deals; crear tareas y comentarios', 'pipeline'),
  ('manage_pipeline_config', 'Configurar etapas', 'Crear, editar y eliminar las etapas del pipeline', 'pipeline')
on conflict (clave) do nothing;
