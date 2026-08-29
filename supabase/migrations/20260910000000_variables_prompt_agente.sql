-- Permite usar los campos personalizados (sección "Variables") como
-- {{marcadores}} dentro del prompt del Agente IA: el agente los detecta,
-- se los pide al cliente conversacionalmente, y los guarda en el contacto.

-- Tipo de dato "teléfono" -- pedido explícitamente para variables como
-- "teléfono de contacto" en el flujo de captura del agente.
alter type public.tipo_campo_personalizado add value 'phone';

alter table public.campos_personalizados
  -- Identificador para usar como {{clave_variable}} en el prompt -- separado
  -- de "nombre" (que sigue siendo la etiqueta libre que ya se mostraba en el
  -- formulario de Contactos) para no romper esa pantalla ni forzar a que el
  -- nombre visible sea un identificador sin espacios/acentos.
  add column clave_variable text,
  -- Dónde debe guardar el agente el valor que extraiga: por default en su
  -- propio valor personalizado (valores_campos_personalizados); si se marca
  -- 'nombre_completo', el agente escribe directo en contactos.nombre_completo
  -- en vez de crear un valor personalizado redundante. Solo aplica al guardado
  -- que hace el agente -- no cambia cómo se comporta el formulario manual de
  -- Contactos.
  add column mapea_a_columna_real text check (mapea_a_columna_real in ('nombre_completo'));

create unique index campos_personalizados_clave_variable_idx
  on public.campos_personalizados (cuenta_id, clave_variable)
  where clave_variable is not null;
