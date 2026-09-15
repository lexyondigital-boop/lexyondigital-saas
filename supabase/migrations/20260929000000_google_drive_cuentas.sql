-- Fase 1 de la integración con Google Sheets: solo la conexión.
-- Crear y leer hojas viene después.
--
-- Va en tabla aparte y no como columnas en `profesionales` porque un
-- profesional puede tener agenda conectada sin Drive y al revés: los tokens
-- de Google Calendar se emitieron con el scope `calendar`, que no sirve para
-- tocar un archivo de Drive. Separarlas evita filas a medio llenar y deja
-- que revocar una no afecte a la otra. Mismo criterio que ya se usa entre
-- cuentas_whatsapp y whatsapp_credenciales.
--
-- `profesional_id` es opcional a propósito: la pantalla lista los
-- profesionales de la sub-cuenta como atajos, pero también permite conectar
-- un correo de Google que no corresponde a ninguno.
create table public.cuentas_google_drive (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  profesional_id uuid references public.profesionales (id) on delete set null,
  google_email text not null,
  refresh_token_cifrado text not null,
  activo boolean not null default true,
  connected_by uuid references public.perfiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Reconectar el mismo correo actualiza la fila en vez de duplicarla.
  unique (cuenta_id, google_email)
);

create index cuentas_google_drive_cuenta_idx on public.cuentas_google_drive (cuenta_id);

alter table public.cuentas_google_drive enable row level security;

-- El frontend nunca lee esta tabla directo (el estado se sirve por una API
-- server-side con el cliente admin, para no exponer el token ni por
-- accidente), pero se deja la policy acotada a la propia cuenta por defensa
-- en profundidad, igual que cuentas_retell y cuentas_correo.
create policy "cuentas_google_drive: ver la propia" on public.cuentas_google_drive
  for select using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());
