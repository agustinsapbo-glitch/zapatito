# V7 — Conexión persistente

## Causa encontrada
La versión 6 guardaba la conexión **solo en `localStorage`** del navegador. Si se abre desde otro navegador, modo privado, una PWA con almacenamiento separado, o el celular borra datos del sitio, se vuelve a solicitar. Además, el manejo de errores mostraba de nuevo la pantalla de configuración ante errores de conexión temporales.

## Solución recomendada para varios empleados
1. Abre `config.js`. Escribe la URL y **clave pública** de tu proyecto Supabase.
2. Sube `config.js`, `app.js` e `index.html` al **mismo directorio** de GitHub Pages o tu hosting. Reemplaza los anteriores.
3. Recarga la web en cada celular. La conexión se cargará automáticamente desde `config.js` en todos los dispositivos, aunque se borre `localStorage`.
4. Cada empleado inicia sesión con su usuario individual. Supabase conserva la sesión si el navegador permite almacenamiento persistente.
5. Si ya configuraste un celular y no quieres publicar `config.js`, deja sus valores vacíos: la aplicación continuará usando el almacenamiento local existente.

## Seguridad
`config.js` es **público** en GitHub Pages. Solo puedes poner URL y clave **anon/publishable**. **Jamás** agregues contraseña, `service_role`, `sb_secret_...` ni credenciales de administrador. Mantén RLS habilitado en Supabase.

## Notas
- No requiere migraciones SQL ni borrar la base de datos.
- Si el teléfono está sin internet, la configuración sigue guardada, pero no se podrán registrar ventas online.
- En algunos navegadores/PWA, el inicio de sesión de empleado puede requerirse de nuevo si se eliminan cookies o datos del sitio; esto no implica volver a configurar Supabase.
- Si cambias el proyecto, modifica `config.js` y vuelve a publicar. La configuración del archivo prevalece sobre la guardada localmente.
- Si aparece una versión antigua, fuerza actualización del navegador o elimina caché de archivos (no los datos del sitio).
