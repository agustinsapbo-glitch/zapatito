# Gerencia general v8

1. Respaldar el proyecto y la base de datos.
2. Ejecutar `actualizacion_v8_manager.sql` en Supabase SQL Editor.
3. En Supabase Authentication > Users crear o invitar al gerente con su correo y contraseña elegida de forma segura.
4. Ejecutar manualmente la sentencia UPDATE comentada al final del SQL, sustituyendo el correo. **No existe una contraseña predeterminada**.
5. Publicar index.html, app.js y styles.css. Conservar config.js real.
6. Iniciar sesión como gerente y abrir Gerencia general.

Funciones: artículos (editar y desactivar/reactivar), insumos (editar), modificadores (editar/desactivar), recetas y componentes de combos (editar/eliminar), perfiles (roles y habilitación) y ajustes comerciales. Las altas se realizan en Configurar desde el botón de cada apartado.

IMPORTANTE: El bloqueo de acceso en la interfaz no reemplaza RLS. La deshabilitación de cuentas existentes requiere además endurecer las RPC de caja, ventas e inventario y revocar sesiones activas mediante Auth Admin API desde un backend seguro. No usar este control como bloqueo inmediato de seguridad hasta completar esa tarea. No insertar service_role en el frontend.
