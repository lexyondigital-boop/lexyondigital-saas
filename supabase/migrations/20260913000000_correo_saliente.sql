-- Correo saliente por sub-cuenta (Gmail OAuth o SMTP genérico), para
-- confirmaciones de cita y campañas de remarketing por correo, como
-- segundo canal de envío junto a WhatsApp.

-- Credenciales de correo por cuenta -- un solo proveedor activo a la vez
-- (google o smtp). Igual que google_oauth_token_cifrado en profesionales,
-- solo se guarda el refresh token (cifrado); el access token nunca se
-- persiste, se pide bajo demanda en cada envío.
create table public.cuentas_correo (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null unique references public.cuentas (id) on delete cascade,
  proveedor text not null check (proveedor in ('google', 'smtp')),
  remitente_nombre text,
  remitente_correo text,
  -- Gmail OAuth
  google_oauth_token_cifrado text,
  google_oauth_email text,
  google_oauth_connected_at timestamptz,
  last_token_refresh timestamptz,
  -- SMTP genérico
  smtp_host text,
  smtp_port integer,
  smtp_seguridad text check (smtp_seguridad in ('ssl', 'tls', 'ninguna')),
  smtp_usuario text,
  smtp_password_cifrado text,
  activo boolean not null default true,
  connected_by uuid references public.perfiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Plantillas de correo por cuenta -- se usan tanto para confirmar citas
-- como para campañas de correo. A diferencia de `templates` (WhatsApp),
-- no requieren aprobación de Meta.
create table public.plantillas_email (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('confirmacion_cita', 'campana')),
  asunto text not null,
  cuerpo_html text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plantillas_email_cuenta_id_idx on public.plantillas_email (cuenta_id);

-- Historial de correos enviados -- separado de `mensajes` porque ese está
-- modelado para el estado de entrega de WhatsApp (status enviado/
-- entregado/leído, whatsapp_message_id) y no aplica a correo.
create table public.correos_enviados (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  contacto_id uuid references public.contactos (id) on delete set null,
  cita_id uuid references public.citas_agendadas (id) on delete set null,
  campana_id uuid references public.campanas (id) on delete set null,
  destinatario text not null,
  asunto text not null,
  estado text not null check (estado in ('enviado', 'fallido')),
  error text,
  created_at timestamptz not null default now()
);

create index correos_enviados_campana_id_idx on public.correos_enviados (campana_id);
create index correos_enviados_cuenta_id_idx on public.correos_enviados (cuenta_id);

-- Idempotencia de la confirmación por correo (para que reagendar no
-- duplique el envío).
alter table public.citas_agendadas
  add column confirmacion_email_enviado boolean not null default false,
  add column confirmacion_email_enviado_at timestamptz;

-- Canal de campaña -- por defecto whatsapp, para no romper las existentes.
alter table public.campanas
  add column canal text not null default 'whatsapp' check (canal in ('whatsapp', 'correo')),
  add column plantilla_email_id uuid references public.plantillas_email (id) on delete set null;

-- Nuevo permiso: la propia sub-cuenta autoconecta su correo y administra
-- sus plantillas de correo -- a diferencia de WhatsApp, que hoy es
-- infraestructura que administra Lexyondigital por seguridad.
insert into public.permisos_catalogo (clave, nombre, descripcion, categoria) values
  ('manage_email', 'Administrar correo', 'Conectar el correo de la cuenta y editar sus plantillas de correo', 'correo');

-- ============================================================
-- RLS
-- ============================================================

alter table public.cuentas_correo enable row level security;
alter table public.plantillas_email enable row level security;
alter table public.correos_enviados enable row level security;

-- cuentas_correo guarda secretos cifrados -- el estado que ve el frontend
-- se sirve por una API server-side con el cliente admin (nunca select *
-- directo desde el navegador), pero de todos modos se deja una policy de
-- lectura acotada a la propia cuenta por defensa en profundidad.
create policy "cuentas_correo: ver la propia" on public.cuentas_correo
  for select using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "plantillas_email: ver de mi cuenta" on public.plantillas_email
  for select using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

create policy "plantillas_email: admins escriben" on public.plantillas_email
  for all using (
    (cuenta_id = public.cuenta_id_actual() and public.es_admin_de_cuenta()) or public.es_super_admin()
  );

create policy "correos_enviados: ver de mi cuenta" on public.correos_enviados
  for select using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());
