-- Catálogo de reportes por cuenta (crear/editar requiere permiso) +
-- preferencia personal de cada usuario sobre cuáles ver y en qué orden
-- en su propio dashboard. Ver plan "Reportes personalizables en el
-- Dashboard".
create table public.reportes (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  nombre text not null,
  entidad text not null check (entidad in ('contactos', 'deals', 'campanas')),
  dimension text not null check (dimension in (
    'etapa_pipeline', 'etiqueta', 'asignado_a', 'canal_origen', 'status', 'fecha_creacion', 'fecha_modificacion'
  )),
  tipo_grafico text not null default 'barras' check (tipo_grafico in ('barras', 'dona', 'linea', 'numero')),
  agrupar_fecha_por text check (agrupar_fecha_por in ('dia', 'semana', 'mes')),
  filtros jsonb not null default '{}',
  creado_por uuid references public.perfiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reportes enable row level security;

create policy "reportes: ver de mi cuenta" on public.reportes
  for select using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "reportes: admins escriben" on public.reportes
  for all using (
    (cuenta_id = public.cuenta_id_actual() and public.es_admin_de_cuenta()) or public.es_super_admin()
  );

-- Sin fila = el usuario no tiene ese reporte en su dashboard; existir =
-- visible. No hace falta un booleano aparte.
create table public.reportes_preferencias_usuario (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  reporte_id uuid not null references public.reportes (id) on delete cascade,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  unique (perfil_id, reporte_id)
);

alter table public.reportes_preferencias_usuario enable row level security;

create policy "reportes_preferencias_usuario: dueño" on public.reportes_preferencias_usuario
  for all using (perfil_id = auth.uid());

insert into public.permisos_catalogo (clave, nombre, descripcion, categoria) values
  ('manage_reportes', 'Administrar reportes', 'Crear, editar y eliminar los reportes disponibles para la cuenta', 'analitica')
on conflict (clave) do nothing;
