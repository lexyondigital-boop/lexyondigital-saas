-- El saludo a un contacto nuevo se mandaba siempre, sin importar si el
-- agente estaba activo o no -- por eso una cuenta con el agente desactivado
-- igual "respondía" el primer mensaje. Ahora ese saludo fijo se vuelve un
-- mensaje de bienvenida configurable por cuenta que solo aplica cuando el
-- agente está inactivo; cuando está activo, el primer mensaje lo responde
-- la IA como cualquier otro (ver src/app/api/webhooks/whatsapp/route.ts).
alter table public.agente_config
  add column enviar_bienvenida_inactivo boolean not null default true,
  add column mensaje_bienvenida_inactivo text;

update public.agente_config
  set mensaje_bienvenida_inactivo = 'Hola {nombre}, gracias por escribirnos. En breve te atenderá alguien de nuestro equipo.'
  where mensaje_bienvenida_inactivo is null;
