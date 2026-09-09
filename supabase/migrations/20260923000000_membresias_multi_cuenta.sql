-- Un mismo login (un solo usuario de auth.users, un solo perfil "de casa")
-- puede tener acceso adicional a otras sub-cuentas -- ej. una persona que
-- trabaja tanto en "Cobranza" como en "Servicio". perfiles.id sigue siendo
-- 1-a-1 con auth.users (todo lo que ya apunta a perfiles.id -- asignado_a,
-- creado_por, etc. -- no cambia); membresias_cuenta es un acceso ADICIONAL
-- sobre esa misma identidad, con su propio rol por cada cuenta a la que
-- entra.
create table public.membresias_cuenta (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  rol text not null check (rol in ('admin', 'agente')),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (perfil_id, cuenta_id)
);

alter table public.membresias_cuenta enable row level security;

-- Cada quien ve sus propias membresías (para saber a qué cuentas puede
-- entrar); el super admin las ve/administra todas. Solo el super admin
-- crea/edita/borra membresías -- dar acceso cruzado entre cuentas es una
-- decisión de plataforma, no algo que un admin de una sub-cuenta deba
-- poder otorgarse a sí mismo o a terceros.
create policy "membresias_cuenta: ver propias o super admin" on public.membresias_cuenta
  for select using (perfil_id = auth.uid() or public.es_super_admin());

create policy "membresias_cuenta: solo super admin administra" on public.membresias_cuenta
  for all using (public.es_super_admin()) with check (public.es_super_admin());

-- cuenta_id_actual() pasa a resolver la cuenta ACTIVA: si el JWT trae
-- app_metadata.cuenta_activa (lo pone /api/auth/cambiar-cuenta vía el
-- cliente admin -- un usuario normal no puede editar su propio
-- app_metadata) y esa cuenta es una membresía activa suya, se usa esa;
-- si no, se cae siempre a su cuenta de casa (perfiles.cuenta_id), igual
-- que antes -- ningún usuario existente nota el cambio.
create or replace function public.cuenta_id_actual()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_home uuid;
  v_reclamada uuid;
  v_es_miembro boolean;
begin
  select cuenta_id into v_home from public.perfiles where id = auth.uid();

  v_reclamada := nullif(auth.jwt() -> 'app_metadata' ->> 'cuenta_activa', '')::uuid;

  if v_reclamada is null or v_reclamada = v_home then
    return v_home;
  end if;

  select exists(
    select 1 from public.membresias_cuenta
    where perfil_id = auth.uid() and cuenta_id = v_reclamada and activo
  ) into v_es_miembro;

  return case when v_es_miembro then v_reclamada else v_home end;
end;
$$;
