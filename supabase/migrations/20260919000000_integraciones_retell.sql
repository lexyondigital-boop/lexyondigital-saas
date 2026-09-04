-- Primera integración del futuro módulo de Integraciones (Configuración):
-- solo la conexión con Retell AI (API key). Disparar llamadas reales
-- (confirmación de citas, campañas de marcación, etc.) queda para la
-- sección de Flujos, un módulo aparte -- esta tabla solo guarda la
-- credencial, mismo molde que cuentas_correo.
create table public.cuentas_retell (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null unique references public.cuentas (id) on delete cascade,
  api_key_cifrada text not null,
  activo boolean not null default true,
  connected_by uuid references public.perfiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cuentas_retell enable row level security;

-- El estado que ve el frontend se sirve por una API server-side con el
-- cliente admin (nunca select * directo desde el navegador), pero se deja
-- una policy de lectura acotada a la propia cuenta por defensa en
-- profundidad, igual que cuentas_correo.
create policy "cuentas_retell: ver la propia" on public.cuentas_retell
  for select using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

insert into public.permisos_catalogo (clave, nombre, descripcion, categoria) values
  ('manage_integraciones', 'Administrar integraciones', 'Conectar y configurar integraciones externas de la cuenta (Retell AI, etc.)', 'integraciones')
on conflict (clave) do nothing;
