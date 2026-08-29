-- Profesionales + agenda + Google Calendar.
--
-- Adaptación del spec recibido a los nombres reales del proyecto:
-- tenant_id -> cuenta_id, users -> perfiles (ya existe, extiende auth.users),
-- user_id -> perfil_id, contacts -> contactos (ya existe), teams -> equipos
-- (ya existe). No se duplica ninguna tabla ya existente.
--
-- El refresh token de Google se guarda cifrado con la misma función
-- AES-256-GCM que ya cifra las API keys de IA (src/lib/cifrado.ts).

create table public.profesionales (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  perfil_id uuid not null unique references public.perfiles (id) on delete cascade,
  nombre text not null,
  especialidad text not null,
  email text,
  telefono text,
  biografia text,
  foto_url text,
  color_agenda text not null default '#6b2fa0',
  horario_inicio time not null default '08:00',
  horario_fin time not null default '18:00',
  dias_disponibles text[] not null default array['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  duracion_cita_minutos integer not null default 30,
  google_calendar_id text,
  google_oauth_token_cifrado text,
  google_oauth_expires_at timestamptz,
  google_oauth_email text,
  google_calendar_name text,
  google_oauth_connected_at timestamptz,
  last_token_refresh timestamptz,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profesionales_cuenta_id_idx on public.profesionales (cuenta_id);

alter table public.perfiles
  add column es_profesional boolean not null default false,
  add column profesional_id uuid references public.profesionales (id) on delete set null;

create index perfiles_es_profesional_idx on public.perfiles (cuenta_id, es_profesional);

create table public.citas_agendadas (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  contacto_id uuid not null references public.contactos (id) on delete cascade,
  profesional_id uuid not null references public.profesionales (id) on delete cascade,
  fecha date not null,
  hora_inicio time not null,
  hora_fin time not null,
  tipo_cita text,
  notas text,
  google_event_id text,
  confirmado boolean not null default true,
  recordatorio_enviado boolean not null default false,
  recordatorio_enviado_at timestamptz,
  estado text not null default 'agendada' check (estado in ('agendada', 'confirmada', 'cancelada', 'completada')),
  creado_por text not null default 'usuario_manual' check (creado_por in ('agente_ia', 'usuario_manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index citas_agendadas_cuenta_id_idx on public.citas_agendadas (cuenta_id);
create index citas_agendadas_profesional_fecha_idx on public.citas_agendadas (profesional_id, fecha);
create index citas_agendadas_contacto_id_idx on public.citas_agendadas (contacto_id);

create table public.cita_bloques_tiempo (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references public.profesionales (id) on delete cascade,
  fecha_inicio date not null,
  fecha_fin date not null,
  hora_inicio time not null,
  hora_fin time not null,
  razon text,
  created_at timestamptz not null default now()
);

create index cita_bloques_tiempo_profesional_idx on public.cita_bloques_tiempo (profesional_id, fecha_inicio, fecha_fin);

-- Permisos nuevos, mismo catálogo que ya usa Usuarios y Permisos.
insert into public.permisos_catalogo (clave, nombre, categoria) values
  ('view_professionals', 'Ver profesionales', 'profesionales'),
  ('manage_professionals', 'Gestionar profesionales', 'profesionales'),
  ('view_appointments', 'Ver citas', 'citas'),
  ('manage_appointments', 'Agendar y cancelar citas', 'citas');

-- ============================================================
-- RLS
-- ============================================================

alter table public.profesionales enable row level security;
alter table public.citas_agendadas enable row level security;
alter table public.cita_bloques_tiempo enable row level security;

create policy "profesionales: por cuenta" on public.profesionales
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "citas_agendadas: por cuenta" on public.citas_agendadas
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "cita_bloques_tiempo: por cuenta del profesional" on public.cita_bloques_tiempo
  for all using (
    exists (
      select 1 from public.profesionales p
      where p.id = profesional_id
        and (p.cuenta_id = public.cuenta_id_actual() or public.es_super_admin())
    )
  );
