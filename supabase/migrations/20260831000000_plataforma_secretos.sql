-- Llaves de API "platform_key" (OpenAI/Claude) administradas desde una
-- pantalla de Configuración exclusiva del super admin, en vez de vivir solo
-- en el .env del VPS -- así se pueden rotar sin acceso al servidor. Cifradas
-- igual que api_key_usuario_cifrada (ver src/lib/cifrado.ts).
create table public.plataforma_secretos (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (clave in ('openai_api_key', 'anthropic_api_key')),
  valor_cifrado text not null,
  vence_en date,
  actualizado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plataforma_secretos enable row level security;

create policy "plataforma_secretos: solo super admin" on public.plataforma_secretos
  for all using (public.es_super_admin());
