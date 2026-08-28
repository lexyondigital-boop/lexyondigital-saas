-- Usuarios y Permisos: equipos, permisos granulares por usuario (encima del
-- rol admin/agente que ya existe en perfiles), historial de cambios de
-- permisos y auditoría de actividad.
--
-- No se duplica "users" -- perfiles YA es esa tabla (extiende auth.users,
-- ya tiene cuenta_id, rol, nombre, telefono, activo). Tampoco se crea
-- role_permissions: nada en las pantallas pedidas la usa: el modelo es más
-- simple -- admin/super_admin tienen todo por default, agente no tiene nada
-- por default, y perfil_permisos guarda las excepciones a esa regla.

create table public.equipos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  nombre text not null,
  descripcion text,
  color text not null default '#8b5cf6',
  creado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cuenta_id, nombre)
);

alter table public.perfiles
  add column equipo_id uuid references public.equipos (id) on delete set null;

-- Catálogo global de permisos (no es por cuenta, es el mismo menú de
-- opciones para todas las sub-cuentas).
create table public.permisos_catalogo (
  clave text primary key,
  nombre text not null,
  descripcion text,
  categoria text not null
);

insert into public.permisos_catalogo (clave, nombre, categoria) values
  ('view_contacts', 'Ver contactos', 'contactos'),
  ('create_contacts', 'Crear contactos', 'contactos'),
  ('edit_contacts', 'Editar contactos', 'contactos'),
  ('view_conversations', 'Ver conversaciones', 'conversaciones'),
  ('create_templates', 'Crear plantillas', 'plantillas'),
  ('edit_templates', 'Editar plantillas', 'plantillas'),
  ('delete_templates', 'Eliminar plantillas', 'plantillas'),
  ('create_campaigns', 'Crear campañas', 'campanas'),
  ('edit_campaigns', 'Editar campañas', 'campanas'),
  ('delete_campaigns', 'Eliminar campañas', 'campanas'),
  ('access_agent_ia', 'Acceder a Agente IA', 'agente_ia'),
  ('configure_agent_ia', 'Configurar Agente IA', 'agente_ia'),
  ('access_configuration', 'Acceder a Configuración', 'configuracion'),
  ('edit_configuration', 'Editar Configuración', 'configuracion'),
  ('view_analytics', 'Ver estadísticas', 'analitica'),
  ('manage_users', 'Gestionar usuarios', 'usuarios'),
  ('manage_teams', 'Gestionar equipos', 'equipos');

-- Excepciones puntuales a los defaults de rol (admin=todo, agente=nada).
create table public.perfil_permisos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  permiso_clave text not null references public.permisos_catalogo (clave) on delete cascade,
  concedido boolean not null default true,
  created_at timestamptz not null default now(),
  unique (perfil_id, permiso_clave)
);

create index perfil_permisos_perfil_id_idx on public.perfil_permisos (perfil_id);

create table public.historial_permisos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  cambiado_por uuid references auth.users (id) on delete set null,
  permiso_clave text not null,
  valor_anterior boolean,
  valor_nuevo boolean,
  tipo_cambio text not null check (tipo_cambio in ('concedido', 'revocado', 'cambio_rol')),
  razon text,
  created_at timestamptz not null default now()
);

create index historial_permisos_cuenta_id_idx on public.historial_permisos (cuenta_id);
create index historial_permisos_perfil_id_idx on public.historial_permisos (perfil_id);

create table public.logs_actividad (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  perfil_id uuid references public.perfiles (id) on delete set null,
  accion text not null,
  recurso_tipo text,
  recurso_id uuid,
  detalles jsonb not null default '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index logs_actividad_cuenta_id_idx on public.logs_actividad (cuenta_id, created_at desc);

-- ============================================================
-- RLS
-- ============================================================

alter table public.equipos enable row level security;
alter table public.permisos_catalogo enable row level security;
alter table public.perfil_permisos enable row level security;
alter table public.historial_permisos enable row level security;
alter table public.logs_actividad enable row level security;

create policy "permisos_catalogo: lectura autenticada" on public.permisos_catalogo
  for select using (auth.uid() is not null);

create policy "equipos: ver de mi cuenta" on public.equipos
  for select using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "equipos: admins insertan" on public.equipos
  for insert with check (
    (cuenta_id = public.cuenta_id_actual() and public.es_admin_de_cuenta()) or public.es_super_admin()
  );

create policy "equipos: admins actualizan" on public.equipos
  for update using (
    (cuenta_id = public.cuenta_id_actual() and public.es_admin_de_cuenta()) or public.es_super_admin()
  );

create policy "equipos: admins borran" on public.equipos
  for delete using (
    (cuenta_id = public.cuenta_id_actual() and public.es_admin_de_cuenta()) or public.es_super_admin()
  );

-- perfil_permisos: el admin de la cuenta administra las excepciones; cada
-- usuario puede leer las suyas (para que el propio front pueda algún día
-- ocultar/mostrar funciones según sus permisos).
create policy "perfil_permisos: admin de la cuenta" on public.perfil_permisos
  for all using (
    (cuenta_id = public.cuenta_id_actual() and public.es_admin_de_cuenta()) or public.es_super_admin()
  );

create policy "perfil_permisos: leer las propias" on public.perfil_permisos
  for select using (perfil_id = auth.uid());

-- historial_permisos y logs_actividad no tienen policy de insert: se
-- escriben siempre desde el servidor con el cliente admin (service_role),
-- que ignora RLS -- así ningún cliente del navegador puede falsificar un
-- registro de auditoría.
create policy "historial_permisos: admin de la cuenta ve" on public.historial_permisos
  for select using (
    (cuenta_id = public.cuenta_id_actual() and public.es_admin_de_cuenta()) or public.es_super_admin()
  );

create policy "logs_actividad: admin de la cuenta ve" on public.logs_actividad
  for select using (
    (cuenta_id = public.cuenta_id_actual() and public.es_admin_de_cuenta()) or public.es_super_admin()
  );
