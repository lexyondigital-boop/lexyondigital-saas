-- Bug real reportado: un usuario con membresía a otra cuenta, al cambiar
-- de cuenta activa, no podía ni siquiera entrar ("tu cuenta no está
-- activa"). Causa: la policy de SELECT de perfiles decía "cuenta_id =
-- cuenta_id_actual()" -- eso daba por hecho que la cuenta activa de un
-- usuario SIEMPRE es la de su propio perfil, cierto antes de
-- membresias_cuenta pero ya no: en cuanto cuenta_id_actual() devuelve una
-- cuenta distinta (una membresía), el usuario deja de poder ver SU PROPIA
-- fila de perfiles (que sigue teniendo su cuenta de casa), y
-- obtenerSesionApp() truena con "sin perfil".
drop policy "perfiles: ver mi cuenta" on public.perfiles;
create policy "perfiles: ver mi cuenta" on public.perfiles
  for select using (id = auth.uid() or cuenta_id = public.cuenta_id_actual() or public.es_super_admin());

-- Mismo problema de fondo en es_admin_de_cuenta(): calculaba el rol
-- SIEMPRE desde el perfil de casa, así que un admin que entra a una
-- cuenta donde su membresía dice "admin" (pero en su casa es "agente", o
-- viceversa) no obtenía los permisos correctos de RLS para la cuenta
-- activa. rol_actual() centraliza esa resolución (casa si la cuenta
-- activa es la de casa o si es super_admin -- ese rol es global; si no,
-- el rol de la membresía activa).
create or replace function public.rol_actual()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_home_cuenta uuid;
  v_home_rol text;
  v_activa uuid;
  v_membresia_rol text;
begin
  select cuenta_id, rol into v_home_cuenta, v_home_rol from public.perfiles where id = auth.uid();

  if v_home_rol = 'super_admin' then
    return v_home_rol;
  end if;

  v_activa := public.cuenta_id_actual();

  if v_activa = v_home_cuenta then
    return v_home_rol;
  end if;

  select rol into v_membresia_rol
  from public.membresias_cuenta
  where perfil_id = auth.uid() and cuenta_id = v_activa and activo;

  return coalesce(v_membresia_rol, v_home_rol);
end;
$$;

create or replace function public.es_admin_de_cuenta()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.rol_actual() in ('admin', 'super_admin'), false);
$$;
