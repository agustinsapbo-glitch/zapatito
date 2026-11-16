# Versión 6 — Supervisión del propietario

## Instalación

1. Haz respaldo de la base de datos y del sitio web.
2. Esta versión requiere las migraciones SQL de las versiones 4 y 5 ya aplicadas. **No requiere nuevas tablas ni migración SQL.**
3. Sustituye `index.html` y `app.js` en GitHub Pages y publica los cambios.
4. Inicia sesión con un usuario cuyo `profiles.role` sea `admin`.
5. Abre la pestaña **📈 Supervisión**, elige fecha y pulsa **Actualizar tablero**.

## Indicadores

Ventas totales, operaciones, ticket promedio, efectivo, transferencia, tarjeta, ventas por hora, por empleado, por turno, productos más vendidos y diferencias de cortes. Exportación CSV. Los turnos se agrupan por fecha de apertura; las ventas por fecha de cobro.

## Notas

* No hay actualización automática continua: el botón consulta los datos actuales.
* Se consultan hasta 10,000 ventas y 10,000 turnos por día, con advertencia si se alcanza el límite. El detalle se consulta por lotes.
* Los nombres de vendedores no están en la tabla de perfiles: se muestra un ID abreviado.
* Los ingresos por líneas de productos pueden diferir del total de ventas cuando existen combos o modificadores. El total de caja siempre se obtiene de `sales.total`.
* Debes probar los permisos de Supabase, el acceso de administrador, las fechas y los cierres en tu entorno antes de operar.
