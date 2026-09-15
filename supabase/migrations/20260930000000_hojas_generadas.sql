-- Fase 2a de Google Sheets: registro de las hojas que la plataforma crea en
-- el Drive del usuario.
--
-- Exportar contactos ya se consideraba una acción sensible y se registraba
-- en logs_actividad (ver /api/contactos/exportar). Al mandar los datos a un
-- Drive externo eso pesa más, no menos: acá queda qué se exportó, con qué
-- columnas, a qué archivo y por quién.
--
-- `columnas` guarda los encabezados con los que se creó la hoja. En la fase
-- de importación sirve para leerla de vuelta aunque después cambien los
-- campos personalizados de la cuenta.
create table public.hojas_generadas (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  -- Si se desconecta el Drive, la hoja sigue existiendo allá y el registro
  -- se conserva; solo se pierde el vínculo con la conexión.
  conexion_id uuid references public.cuentas_google_drive (id) on delete set null,
  spreadsheet_id text not null,
  url text not null,
  nombre text not null,
  columnas text[] not null,
  total_filas integer not null default 0,
  creado_por uuid references public.perfiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index hojas_generadas_cuenta_idx on public.hojas_generadas (cuenta_id, created_at desc);

alter table public.hojas_generadas enable row level security;

create policy "hojas_generadas: ver las de la propia cuenta" on public.hojas_generadas
  for select using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());
