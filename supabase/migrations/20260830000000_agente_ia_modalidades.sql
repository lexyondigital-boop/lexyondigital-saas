-- Motor de IA real para el agente: hasta ahora agente_config solo guardaba
-- preferencias, nada llamaba a un LLM. Esto agrega selección de proveedor,
-- modo de API (llave propia del cliente vs. llave de la plataforma) y el
-- registro de uso/costo. La "modalidad" sugestivo/automático ya existía como
-- parte del enum de agente_config.modo -- no se duplica esa columna, el
-- runtime solo trata 'sugestivo' distinto de cualquier otro valor.

alter table public.agente_config
  add column proveedor_ia text not null default 'openai' check (proveedor_ia in ('openai', 'claude')),
  add column modo_api text not null default 'platform_key' check (modo_api in ('user_key', 'platform_key')),
  -- Cifrado con AES-256-GCM (ver src/lib/cifrado.ts) -- nunca se guarda en texto plano.
  add column api_key_usuario_cifrada text;

-- Marca si una sugerencia de IA ya fue usada/descartada por el agente humano,
-- para que la UI deje de mostrar los botones de acción sobre ese mensaje, y
-- guarda el texto si lo editó antes de enviarlo. sugerencia_ia y feedback_ia
-- ya existían desde el esquema inicial.
alter table public.mensajes
  add column sugerencia_usada boolean not null default false,
  add column editado_humano text;

create table public.agente_uso_ia (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  contacto_id uuid references public.contactos (id) on delete set null,
  conversacion_id uuid references public.conversaciones (id) on delete set null,
  proveedor text not null check (proveedor in ('openai', 'claude')),
  -- Modalidad vigente al momento de la llamada (agente_config.modo puede
  -- cambiar después; esto deja el histórico correcto).
  modalidad text not null,
  tokens_entrada integer not null default 0,
  tokens_salida integer not null default 0,
  tokens_total integer not null default 0,
  costo_usd numeric(10, 4) not null default 0,
  created_at timestamptz not null default now()
);

create index agente_uso_ia_cuenta_id_idx on public.agente_uso_ia (cuenta_id);

alter table public.agente_uso_ia enable row level security;

create policy "agente_uso_ia: por cuenta" on public.agente_uso_ia
  for all using (cuenta_id = public.cuenta_id_actual() or public.es_super_admin());
