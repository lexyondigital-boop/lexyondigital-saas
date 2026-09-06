-- Agentes de Voz — Fase A de "Plantillas maestras": fundación de datos, sin
-- UI todavía. La cuenta master podrá crear plantillas base (Ventas, Legal,
-- Médico, etc.) que las sub-cuentas usan como punto de partida al crear un
-- agente -- son un blueprint de datos, no un agente real de Retell (Retell
-- no permite duplicar un agente entre cuentas/API keys distintas, y una
-- sub-cuenta puede estar en modo "master" o "propia").

create table public.plantillas_voz_maestras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  agente_tipo text not null default 'servicio' check (agente_tipo in ('servicio', 'citas', 'venta', 'cobranza', 'legal')),
  categoria text not null default 'servicios' check (categoria in ('legal', 'medicos', 'inmobiliario', 'servicios', 'cobranza', 'ventas')),
  copyscript text not null default '',
  objetivo text,
  retell_voice_id text,
  retell_idioma text not null default 'es-419',
  retell_colgar_buzon boolean not null default true,
  retell_colgar_ivr boolean not null default true,
  retell_pantalla_llamadas boolean not null default false,
  retell_dtmf_activo boolean not null default false,
  retell_dtmf_timeout_ms integer not null default 2500,
  retell_dtmf_clave_terminacion text,
  retell_dtmf_limite_digitos integer,
  retell_fin_silencio_ms integer not null default 600000,
  retell_duracion_maxima_ms integer not null default 3600000,
  retell_duracion_anillo_ms integer not null default 30000,
  retell_funciones jsonb not null default
    '[{"type":"end_call","name":"fin_de_llamada","description":"Cuelga la llamada cuando la conversación haya terminado naturalmente o el cliente se despida."}]'::jsonb,
  status text not null default 'activa' check (status in ('activa', 'deprecada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plantillas_voz_maestras_dtmf_clave_check check (
    retell_dtmf_clave_terminacion is null or
    retell_dtmf_clave_terminacion in ('0','1','2','3','4','5','6','7','8','9','#','*')
  )
);

alter table public.plantillas_voz_maestras enable row level security;

-- Solo el super-admin gestiona/lee plantillas maestras directo -- las
-- sub-cuentas las verán en la Fase D a través de una ruta propia que resuelve
-- visibilidad (respetando plantillas_voz_maestras_ocultas), no por RLS
-- directo a esta tabla.
create policy "plantillas_voz_maestras: solo super admin" on public.plantillas_voz_maestras
  for all using (public.es_super_admin());

-- Su sola presencia oculta esa plantilla para esa cuenta -- ausencia =
-- visible (default "todas las plantillas activas se muestran a todas las
-- sub-cuentas", con control por excepción desde la cuenta master).
create table public.plantillas_voz_maestras_ocultas (
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  plantilla_maestra_id uuid not null references public.plantillas_voz_maestras (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cuenta_id, plantilla_maestra_id)
);

alter table public.plantillas_voz_maestras_ocultas enable row level security;

create policy "plantillas_voz_maestras_ocultas: super admin administra" on public.plantillas_voz_maestras_ocultas
  for all using (public.es_super_admin());

create policy "plantillas_voz_maestras_ocultas: la propia cuenta ve qué se le ocultó" on public.plantillas_voz_maestras_ocultas
  for select using (cuenta_id = public.cuenta_id_actual());

-- plantilla_base_clave nunca se llegó a usar de verdad (ningún formulario la
-- llenaba ni la leía) -- se reaprovecha como la referencia real a la
-- plantilla maestra de origen de cada agente.
alter table public.plantillas_voz drop column if exists plantilla_base_clave;
alter table public.plantillas_voz add column if not exists plantilla_madre_id uuid references public.plantillas_voz_maestras (id) on delete set null;
