-- Fase 2 del módulo "Agentes de Voz": plantillas de voz (CRUD, en la
-- sección Plantillas), envío/llamada manual de una plantilla de voz desde
-- Conversaciones, y el número saliente de Retell (from_number) que exige
-- cada llamada -- se trae de la propia cuenta de Retell
-- (GET /v2/list-phone-numbers) y se guarda ya elegido en cuentas_retell.

alter table public.cuentas_retell add column if not exists numero_saliente text;

create table public.plantillas_voz (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  nombre text not null,
  copyscript text not null default '',
  objetivo text,
  agente_tipo text not null default 'servicio' check (agente_tipo in ('servicio', 'citas', 'venta', 'cobranza', 'legal')),
  categoria text not null default 'servicios' check (categoria in ('legal', 'medicos', 'inmobiliario', 'servicios', 'cobranza', 'ventas')),
  plantilla_base_clave text,
  publicada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cuenta_id, nombre)
);

alter table public.plantillas_voz enable row level security;

create policy "plantillas_voz: ver de mi cuenta" on public.plantillas_voz
  for select using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "plantillas_voz: admins escriben" on public.plantillas_voz
  for all using (
    (cuenta_id = public.cuenta_id_actual() and public.es_admin_de_cuenta()) or public.es_super_admin()
  );

-- Columnas mínimas para el envío manual de esta fase -- transcripción,
-- duración y audio real llegan con el webhook de Retell (Fase 6).
create table public.llamadas_voz (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  contacto_id uuid references public.contactos (id) on delete set null,
  conversacion_id uuid references public.conversaciones (id) on delete set null,
  plantilla_voz_id uuid references public.plantillas_voz (id) on delete set null,
  campana_id uuid references public.campanas (id) on delete set null,
  campana_contacto_id uuid references public.campana_contactos (id) on delete set null,
  retell_call_id text,
  status text not null default 'en_progreso' check (status in ('en_progreso', 'completada', 'fallida', 'sin_respuesta')),
  resultado text default 'pendiente' check (resultado in ('acepto', 'rechazo', 'pendiente')),
  duracion_segundos integer,
  transcripcion text,
  audio_url text,
  created_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

alter table public.llamadas_voz enable row level security;

create policy "llamadas_voz: ver de mi cuenta" on public.llamadas_voz
  for select using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

insert into public.permisos_catalogo (clave, nombre, descripcion, categoria) values
  ('manage_plantillas_voz', 'Plantillas y agentes de voz', 'Crear, editar, publicar y llamar con plantillas de voz (Retell)', 'agentes_voz')
on conflict (clave) do nothing;
