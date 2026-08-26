-- Cuenta de prueba para probar el webhook de WhatsApp de punta a punta.
-- App de Meta: "Lexyondigital multi-agente" (2511681406008390)
-- No corre sola con las migraciones — es un seed manual de una sola vez.

do $$
declare
  v_cuenta_id uuid;
  v_cuenta_whatsapp_id uuid;
begin
  insert into public.cuentas (nombre, plan)
  values ('Cuenta de prueba — Lexyondigital multi-agente', 'trial')
  returning id into v_cuenta_id;

  insert into public.cuentas_whatsapp (cuenta_id, phone_number_id, waba_id, estado)
  values (v_cuenta_id, '1355525977636466', '896710869864936', 'activo')
  returning id into v_cuenta_whatsapp_id;

  insert into public.whatsapp_credenciales (cuenta_whatsapp_id, access_token)
  values (v_cuenta_whatsapp_id, 'PEGA_AQUI_TU_ACCESS_TOKEN_TEMPORAL');

  raise notice 'cuenta_id creado: %', v_cuenta_id;
end $$;
