-- Agentes de Voz — número telefónico asignado por plantilla maestra:
-- cada plantilla maestra tiene su propia lista de números elegibles (de los
-- que la cuenta master ya tiene comprados en Retell), y la cuenta master
-- asigna, por sub-cuenta y por plantilla, cuál de esos números le toca.

alter table public.plantillas_voz_maestras
  add column if not exists retell_numeros_disponibles jsonb not null default '[]'::jsonb;

create table public.plantillas_voz_maestras_numeros_asignados (
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  plantilla_maestra_id uuid not null references public.plantillas_voz_maestras (id) on delete cascade,
  numero text not null,
  created_at timestamptz not null default now(),
  primary key (cuenta_id, plantilla_maestra_id)
);

alter table public.plantillas_voz_maestras_numeros_asignados enable row level security;

create policy "plantillas_voz_maestras_numeros_asignados: super admin administra" on public.plantillas_voz_maestras_numeros_asignados
  for all using (public.es_super_admin());

create policy "plantillas_voz_maestras_numeros_asignados: la propia cuenta ve su asignación" on public.plantillas_voz_maestras_numeros_asignados
  for select using (cuenta_id = public.cuenta_id_actual());

-- Se resuelve una sola vez al crear el agente (a partir de la asignación de
-- ese momento) y queda fijo -- si el número asignado cambia después, no
-- afecta a los agentes ya creados.
alter table public.plantillas_voz add column if not exists retell_numero_saliente text;
