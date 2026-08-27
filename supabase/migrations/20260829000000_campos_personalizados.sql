-- Campos personalizados por cuenta ("Variables" en el sidebar): permite que
-- cada sub-cuenta defina sus propios campos de contacto además de los fijos
-- (nombre, teléfono, etiquetas...).

create type public.tipo_campo_personalizado as enum ('text', 'number', 'date', 'select', 'checkbox', 'email');

create table public.campos_personalizados (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  nombre text not null,
  tipo public.tipo_campo_personalizado not null default 'text',
  requerido boolean not null default false,
  orden integer not null default 0,
  -- Lista de opciones para 'select'/'checkbox', ej. ["Opción 1", "Opción 2"].
  opciones jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campos_personalizados_cuenta_id_idx on public.campos_personalizados (cuenta_id);

create table public.valores_campos_personalizados (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid not null references public.contactos (id) on delete cascade,
  campo_id uuid not null references public.campos_personalizados (id) on delete cascade,
  -- Texto plano para todos los tipos; 'checkbox' (multi-selección) guarda
  -- las opciones marcadas separadas por coma.
  valor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contacto_id, campo_id)
);

create index valores_campos_personalizados_contacto_id_idx on public.valores_campos_personalizados (contacto_id);

-- "nombre" en contactos ya se usa para el nombre que llega de WhatsApp (ver
-- el webhook) -- este es el nombre completo que captura el equipo a mano,
-- son cosas distintas a propósito.
alter table public.contactos add column nombre_completo text;

alter table public.campos_personalizados enable row level security;
alter table public.valores_campos_personalizados enable row level security;

create policy "campos_personalizados: por cuenta" on public.campos_personalizados
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "valores_campos_personalizados: por cuenta del contacto" on public.valores_campos_personalizados
  for all using (
    exists (
      select 1 from public.contactos c
      where c.id = contacto_id
        and (c.cuenta_id = public.cuenta_id_actual() or public.es_super_admin())
    )
  );
