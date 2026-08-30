-- "Variables fijas del sistema": nombre_completo, telefono y correo_electronico
-- deben existir SIEMPRE, idénticas, en cualquier cuenta -- el admin no las
-- crea ni las puede editar/borrar, para que el sistema base sea consistente
-- entre clientes. Se implementan como filas normales de campos_personalizados
-- (así ya aparecen solas en "+ Agregar variable" del prompt) marcadas con
-- es_fijo = true, sembradas por un trigger en cuanto se crea la cuenta.

alter table public.contactos add column correo_electronico text;

alter table public.campos_personalizados
  add column es_fijo boolean not null default false;

-- telefono se incluye en el set de columnas reales permitidas solo para que
-- {{telefono}} se pueda RESOLVER (mostrar en el prompt, en las notas de la
-- cita, en la descripción del evento de Google Calendar) -- el agente nunca
-- debe poder sobrescribirlo vía guardar_datos_contacto, porque es la llave
-- de enrutamiento real de WhatsApp: si la IA lo captura mal, se rompe el
-- envío de mensajes en silencio. Ese bloqueo se hace en código
-- (agente-acciones.ts), no aquí -- esta constraint solo valida que el valor
-- sea uno de los tres nombres de columna reconocidos.
do $$
declare
  nombre_constraint text;
begin
  select conname into nombre_constraint
  from pg_constraint
  where conrelid = 'public.campos_personalizados'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%mapea_a_columna_real%';

  if nombre_constraint is not null then
    execute format('alter table public.campos_personalizados drop constraint %I', nombre_constraint);
  end if;
end $$;

alter table public.campos_personalizados
  add constraint campos_personalizados_mapea_a_columna_real_check
    check (mapea_a_columna_real in ('nombre_completo', 'correo_electronico', 'telefono'));

-- Usa el mismo índice único parcial que ya protege clave_variable por
-- cuenta (creado en 20260910000000) como blanco del ON CONFLICT -- ambas
-- condiciones (columnas y el "where") deben calzar exacto con ese índice.
create or replace function public.sembrar_variables_fijas(p_cuenta_id uuid)
returns void
language sql
as $$
  insert into public.campos_personalizados
    (cuenta_id, nombre, tipo, requerido, orden, clave_variable, mapea_a_columna_real, es_fijo)
  values
    (p_cuenta_id, 'Nombre completo', 'text', false, -3, 'nombre_completo', 'nombre_completo', true),
    (p_cuenta_id, 'Teléfono', 'phone', false, -2, 'telefono', 'telefono', true),
    (p_cuenta_id, 'Correo electrónico', 'email', false, -1, 'correo_electronico', 'correo_electronico', true)
  on conflict (cuenta_id, clave_variable) where clave_variable is not null do nothing;
$$;

-- Backfill: todas las cuentas que ya existían antes de esta migración.
do $$
declare
  fila record;
begin
  for fila in select id from public.cuentas loop
    perform public.sembrar_variables_fijas(fila.id);
  end loop;
end $$;

create or replace function public.trigger_sembrar_variables_fijas()
returns trigger
language plpgsql
as $$
begin
  perform public.sembrar_variables_fijas(new.id);
  return new;
end;
$$;

create trigger cuentas_sembrar_variables_fijas
  after insert on public.cuentas
  for each row execute function public.trigger_sembrar_variables_fijas();
