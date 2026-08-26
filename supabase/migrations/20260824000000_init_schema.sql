-- Esquema base multi-cuenta para lexyondigital-saas.
-- Informado por el modelo del Portal Lexyondigital en producción (mismo patrón
-- de cuenta_id por fila), pero es un esquema nuevo: no migra datos de ningún
-- proyecto existente.

create extension if not exists "pgcrypto";

-- ============================================================
-- CUENTAS Y PERFILES
-- ============================================================

create table public.cuentas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  plan text not null default 'trial' check (plan in ('trial', 'basico', 'pro', 'agencia')),
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  nombre text,
  rol text not null default 'agente' check (rol in ('super_admin', 'admin', 'agente')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create index perfiles_cuenta_id_idx on public.perfiles (cuenta_id);

-- Helpers de RLS. SECURITY DEFINER para leer "perfiles" sin recursividad
-- de políticas (una política de perfiles no puede consultar perfiles
-- directamente sin esto).
create function public.cuenta_id_actual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cuenta_id from public.perfiles where id = auth.uid();
$$;

create function public.es_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select rol = 'super_admin' from public.perfiles where id = auth.uid()),
    false
  );
$$;

create function public.es_admin_de_cuenta()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select rol in ('admin', 'super_admin') from public.perfiles where id = auth.uid()),
    false
  );
$$;

-- ============================================================
-- WHATSAPP (conexión y credenciales por cuenta)
-- ============================================================

create table public.cuentas_whatsapp (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  phone_number_id text not null,
  waba_id text,
  estado text not null default 'inactivo' check (estado in ('activo', 'inactivo', 'error')),
  created_at timestamptz not null default now()
);

create index cuentas_whatsapp_cuenta_id_idx on public.cuentas_whatsapp (cuenta_id);

create table public.whatsapp_credenciales (
  id uuid primary key default gen_random_uuid(),
  cuenta_whatsapp_id uuid not null references public.cuentas_whatsapp (id) on delete cascade,
  access_token text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CONTACTOS, ETIQUETAS, CONVERSACIONES, MENSAJES
-- ============================================================

create table public.etiquetas (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now(),
  unique (cuenta_id, nombre)
);

create table public.contactos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  telefono text not null,
  nombre text,
  etiquetas text[] not null default '{}',
  status text not null default 'activo' check (status in ('activo', 'inactivo')),
  canal_origen text,
  campana_status text,
  created_at timestamptz not null default now(),
  unique (cuenta_id, telefono)
);

create index contactos_cuenta_id_idx on public.contactos (cuenta_id);

create table public.conversaciones (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  contacto_id uuid not null references public.contactos (id) on delete cascade,
  telefono text not null,
  status text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  agente_ia_activo boolean not null default true,
  ventana_activa boolean not null default false,
  created_at timestamptz not null default now()
);

create index conversaciones_cuenta_id_idx on public.conversaciones (cuenta_id);
create index conversaciones_contacto_id_idx on public.conversaciones (contacto_id);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  name text not null,
  language text not null default 'es_MX',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  body text,
  variables jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index templates_cuenta_id_idx on public.templates (cuenta_id);

create table public.mensajes (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  conversacion_id uuid references public.conversaciones (id) on delete set null,
  contacto_id uuid references public.contactos (id) on delete set null,
  campana_id uuid,
  direccion text not null check (direccion in ('entrante', 'saliente')),
  tipo text not null default 'texto' check (tipo in ('texto', 'template', 'imagen', 'documento')),
  contenido text,
  template_nombre text,
  status text not null default 'enviado' check (status in ('enviado', 'entregado', 'leido', 'fallido')),
  whatsapp_message_id text,
  sugerencia_ia text,
  feedback_ia text check (feedback_ia in ('positivo', 'negativo')),
  created_at timestamptz not null default now()
);

create index mensajes_cuenta_id_idx on public.mensajes (cuenta_id);
create index mensajes_conversacion_id_idx on public.mensajes (conversacion_id);

-- ============================================================
-- CAMPAÑAS
-- ============================================================

create table public.campanas (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  nombre text not null,
  template_id uuid references public.templates (id) on delete set null,
  etiqueta_id uuid references public.etiquetas (id) on delete set null,
  status text not null default 'borrador' check (
    status in ('borrador', 'enviando', 'pausada', 'enviada')
  ),
  total_destinatarios integer not null default 0,
  total_enviados integer not null default 0,
  created_at timestamptz not null default now()
);

create index campanas_cuenta_id_idx on public.campanas (cuenta_id);

alter table public.mensajes
  add constraint mensajes_campana_id_fkey
  foreign key (campana_id) references public.campanas (id) on delete set null;

-- Cola de estado por contacto: esto reemplaza el par splitInBatches + Wait(60s)
-- de n8n. El cron de Fase 0 recorre las filas 'pendiente' de una campaña
-- 'enviando', una por invocación, y las va marcando 'enviado' / 'fallido'.
create table public.campana_contactos (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campanas (id) on delete cascade,
  contacto_id uuid not null references public.contactos (id) on delete cascade,
  status text not null default 'pendiente' check (status in ('pendiente', 'enviado', 'fallido')),
  variables jsonb not null default '[]',
  enviado_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campana_id, contacto_id)
);

create index campana_contactos_campana_id_idx on public.campana_contactos (campana_id);
create index campana_contactos_status_idx on public.campana_contactos (campana_id, status);

-- ============================================================
-- AGENTE IA
-- ============================================================

create table public.agente_config (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  nombre text not null default 'Agente',
  activo boolean not null default true,
  modo text not null default 'sugestivo' check (modo in ('sugestivo', 'semi_automatico', 'automatico')),
  prompt text,
  tono text not null default 'profesional',
  idioma text not null default 'es',
  max_mensajes integer not null default 10,
  horario_inicio time not null default '08:00',
  horario_fin time not null default '20:00',
  mensaje_fuera_horario text,
  mensaje_transferencia text,
  trigger_palabras text[] not null default '{}',
  seguimiento_horas integer not null default 24,
  updated_at timestamptz not null default now(),
  unique (cuenta_id)
);

create table public.agente_faqs (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  pregunta text not null,
  respuesta text not null,
  created_at timestamptz not null default now()
);

create table public.agente_documentos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  nombre_archivo text not null,
  url text not null,
  tipo text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- RLS
-- ============================================================
-- El service_role (usado en route handlers de webhooks/cron) ignora RLS por
-- diseño de Supabase — estas políticas solo gobiernan el acceso desde el
-- cliente (browser) y desde Server Components/Actions con sesión de usuario.

alter table public.cuentas enable row level security;
alter table public.perfiles enable row level security;
alter table public.cuentas_whatsapp enable row level security;
alter table public.whatsapp_credenciales enable row level security;
alter table public.etiquetas enable row level security;
alter table public.contactos enable row level security;
alter table public.conversaciones enable row level security;
alter table public.templates enable row level security;
alter table public.mensajes enable row level security;
alter table public.campanas enable row level security;
alter table public.campana_contactos enable row level security;
alter table public.agente_config enable row level security;
alter table public.agente_faqs enable row level security;
alter table public.agente_documentos enable row level security;

-- cuentas: solo lectura de la propia cuenta. Su creación (alta de un nuevo
-- cliente/tenant) pasa por un route handler con service_role, no por RLS de
-- cliente — mismo patrón que el webhook "crear-usuario" del CRM actual.
create policy "cuentas: ver la propia" on public.cuentas
  for select using (id = public.cuenta_id_actual() or public.es_super_admin());

create policy "perfiles: ver mi cuenta" on public.perfiles
  for select using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "perfiles: admins insertan en su cuenta" on public.perfiles
  for insert with check (
    (cuenta_id = public.cuenta_id_actual() and public.es_admin_de_cuenta())
    or public.es_super_admin()
  );

create policy "perfiles: admins actualizan su cuenta" on public.perfiles
  for update using (
    (cuenta_id = public.cuenta_id_actual() and public.es_admin_de_cuenta())
    or public.es_super_admin()
  );

create policy "perfiles: admins borran en su cuenta" on public.perfiles
  for delete using (
    (cuenta_id = public.cuenta_id_actual() and public.es_admin_de_cuenta())
    or public.es_super_admin()
  );

-- Patrón repetido para el resto de tablas con cuenta_id directa: acceso total
-- (select/insert/update/delete) restringido a la propia cuenta o super_admin.
create policy "cuentas_whatsapp: por cuenta" on public.cuentas_whatsapp
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "whatsapp_credenciales: por cuenta" on public.whatsapp_credenciales
  for all using (
    exists (
      select 1 from public.cuentas_whatsapp cw
      where cw.id = cuenta_whatsapp_id
        and (cw.cuenta_id = public.cuenta_id_actual() or public.es_super_admin())
    )
  );

create policy "etiquetas: por cuenta" on public.etiquetas
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "contactos: por cuenta" on public.contactos
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "conversaciones: por cuenta" on public.conversaciones
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "templates: por cuenta" on public.templates
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "mensajes: por cuenta" on public.mensajes
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "campanas: por cuenta" on public.campanas
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "campana_contactos: por cuenta de la campaña" on public.campana_contactos
  for all using (
    exists (
      select 1 from public.campanas c
      where c.id = campana_id
        and (c.cuenta_id = public.cuenta_id_actual() or public.es_super_admin())
    )
  );

create policy "agente_config: por cuenta" on public.agente_config
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "agente_faqs: por cuenta" on public.agente_faqs
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "agente_documentos: por cuenta" on public.agente_documentos
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());
