# Mi Puesto POS v3 — Barbacoa, lonches, tacos al vapor y cafetería

**Instalación:** Ejecuta `database.sql` y luego `catalogo_barbacoa_cafe.sql` en el editor SQL de Supabase. Si ya tienes la versión 2, **no vuelvas a ejecutar database.sql**: ejecuta únicamente `catalogo_barbacoa_cafe.sql`, que agrega la columna de categorías e importa el catálogo sin duplicar los productos de ejemplo. Sube los archivos web a GitHub Pages y sigue la configuración de Supabase que se explica abajo.

**Catálogo incluido:** 18 productos, cuatro categorías, materias primas y recetas iniciales, con precios estimados en MXN. Todos los insumos arrancan con existencia 0. Registra compras antes de vender. Los consumos de receta son aproximaciones para pruebas: valida gramajes, rendimientos y costos antes de operar. Las órdenes mixtas de tacos al vapor se modelan como combinación fija de guisos; ajusta a tu oferta real.

**Impresión:** conserva tickets por impresión del navegador a impresoras USB/Bluetooth instaladas o reconocidas por el dispositivo; no promete conexión directa ESC/POS.

**Limitaciones:** los precios son demostrativos; el sistema no administra modificadores de bebida (leche, endulzante, extras) dentro de una misma línea, ni facturación fiscal, ni ventas sin conexión. Para opciones distintas, crea productos adicionales.

---

# Mi Puesto POS — instalación gratuita

Aplicación web móvil (PWA) con Supabase (PostgreSQL + autenticación) y hosting estático (GitHub Pages o Cloudflare Pages). Los planes gratuitos tienen límites y condiciones que pueden cambiar. Requiere internet; **no** tiene modo de ventas sin conexión.

## Publicación paso a paso

1. Crea un proyecto en https://supabase.com (plan gratuito si está disponible). Conserva la contraseña de base de datos en privado.
2. Abre **SQL Editor**, pega el contenido de `database.sql` y ejecútalo una sola vez sobre un proyecto nuevo.
3. En **Authentication → Users**, crea un usuario con correo y contraseña (y otros usuarios vendedores). Desactiva el registro público si no quieres altas libres.
4. En SQL Editor, asigna tu usuario como administrador (sustituye el correo):
   ```sql
   update public.profiles set role='admin'
   where id=(select id from auth.users where email='admin@ejemplo.com');
   ```
5. En Supabase **Project Settings → API / Data API**, copia la URL del proyecto y la clave **anon** o **publishable**. **Nunca copies la clave `service_role` ni contraseñas de la base de datos a la web.**
6. Crea un repositorio en https://github.com y sube `index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, `icon.svg` a la raíz. No es necesario subir `database.sql` al hosting.
7. Activa **Settings → Pages → Deploy from a branch**, elige `main` y `/ (root)`. Abre la URL HTTPS que GitHub Pages publique. Como alternativa, usa Cloudflare Pages para desplegar la misma carpeta estática.
8. En la primera apertura de la aplicación introduce la URL y la clave pública de Supabase. Inicia sesión con el usuario administrador. Cada empleado entra desde su celular con su propio usuario.
9. En **Configurar**, crea productos, insumos, metas y recetas. En **Almacén**, registra las existencias iniciales mediante entradas. Después prueba una venta y verifica el descuento automático.
10. En el celular abre la URL HTTPS y elige **Agregar a pantalla de inicio** desde el navegador para usarla como app.

## Roles y operaciones

- **admin**: productos, insumos, recetas, entradas y ajustes de inventario, ventas e informes globales.
- **seller**: registrar ventas, ver catálogo y existencias, consultar solo sus propias ventas. No puede modificar inventario ni precios.
- Cada venta registra vendedor, productos, cantidades, precio de ese momento, forma de pago, efectivo recibido y hora.
- Las recetas descuentan automáticamente insumos en una transacción de base de datos; el sistema bloquea ventas con existencias insuficientes para recetas configuradas.
- El informe de reorden compara stock con mínimo y sugiere comprar hasta el stock objetivo.
- La producción sugerida calcula necesidades de materias primas para la meta por producto; no crea órdenes de fabricación ni descuenta inventario hasta una venta.
- Exportación CSV de ventas consultadas y lista de reorden.

## Consideraciones antes de usar en producción

- Es una **versión inicial funcional**, no un sistema fiscal ni un sustituto de CFDI, facturación, conciliación bancaria o control contable.
- Los productos sin receta se pueden vender sin descontar materias primas: configura todas las recetas antes de operar.
- No incluye devoluciones, cancelaciones, cortes de caja, impresión de tickets, compras a proveedores ni manejo de inventario por sucursal.
- Las fechas de reportes dependen de la zona horaria del navegador; verifica los cortes al cierre del día. La consulta muestra hasta 1,000 ventas por fecha.
- La interfaz no ofrece edición/eliminación de catálogos; un administrador puede hacerlo desde el panel de Supabase, con cuidado de la integridad histórica.
- Para varios puestos o almacenes separados necesitarás ampliar el modelo con sucursales, asignaciones y existencias por ubicación.
- Antes de abrir a empleados: revisa políticas RLS, usa contraseñas seguras, verifica respaldos y realiza pruebas simultáneas. Supabase ofrece opciones de respaldo según plan.
- El servidor de Supabase almacena datos en la región elegida al crear el proyecto; evalúa obligaciones de privacidad aplicables.

## Estructura

- `index.html`: interfaz adaptable al celular
- `styles.css`: estilos responsivos
- `app.js`: catálogo, carrito, reportes y comunicación con Supabase
- `database.sql`: esquema, permisos y transacciones seguras
- `manifest.webmanifest`, `icon.svg`: instalación PWA

## Prueba rápida

Crea una materia prima «Tortilla» (unidad `pza`, mínimo `20`, objetivo `100`), registra entrada de `100`, crea producto «Taco» a `$25` y receta de `2` tortillas por taco. Al cobrar 3 tacos, el stock debe bajar a 94. Dos vendedores simultáneos deben descontar stock sin permitir saldo negativo.


## Impresión de tickets (USB y Bluetooth)

En **Venta rápida**, deja marcada **Imprimir ticket al cobrar** para abrir el diálogo de impresión tras confirmar la venta, o usa **Reimprimir último ticket**. El comprobante contiene folio, fecha, productos, cantidades, precios, total, forma de pago, recibido y cambio. El formato CSS está preparado para papel térmico de 80 mm; para impresoras de 58 mm, ajusta el ancho de `body` a aproximadamente `48mm` y el tamaño `@page` a `58mm auto` en `app.js`.

**USB:** instala/configura la impresora en Windows/macOS o usa una impresora admitida por el sistema Android. **Bluetooth:** vincula la impresora con el celular o equipo y verifica que aparezca en el menú de impresión del navegador. Algunas impresoras térmicas ESC/POS económicas no ofrecen controlador de impresión del sistema; esas requieren una aplicación puente o integración específica según modelo, no compatible de forma universal desde un navegador. En iPhone/iPad la impresión nativa normalmente requiere AirPrint o un puente compatible.

El navegador no puede seleccionar automáticamente cualquier impresora USB/Bluetooth ni garantizar impresión silenciosa. Autoriza ventanas emergentes para este sitio y elige la impresora en el diálogo. El ticket solo se genera después de que la base de datos confirme la venta. **Reimprimir último ticket** está disponible durante la sesión/pestaña actual; no reemplaza un historial de reimpresión persistente.


## Versión 4: café personalizado y combos

1. Si ya instalaste la versión 3, ejecuta **actualizacion_v4.sql** en el editor SQL de Supabase. No vuelvas a ejecutar `database.sql` ni el catálogo para esta actualización.
2. Sustituye `index.html` y `app.js` en GitHub Pages y actualiza el navegador.
3. En **Ventas**, al tocar un café se abre un selector de tamaño, temperatura, leche, sabor, azúcar y topping. Los cargos se suman al precio base.
4. En **Configurar**, el administrador puede crear opciones, vincular insumos y consumos, así como crear combos de dos componentes.
5. Los combos descuentan automáticamente los insumos de las recetas de sus componentes. La producción sugerida contempla los combos.
6. Se agrega un combo de ejemplo: 4 tacos de barbacoa y americano 12 oz por $120 MXN.

**Antes de vender:** revisa precios, opciones, recetas, unidades, tamaños y existencias. Las opciones de ejemplo no incluyen consumos adicionales: debes vincularlos a sus insumos y cantidades para reflejar el consumo real. Las selecciones son opcionales, una por grupo, y se aplican únicamente a productos de la categoría `cafe`. El sistema no sustituye una prueba operativa con impresora física y varios usuarios.

## Versión 5 — Cortes de caja por empleado y turno

1. **Actualizar base de datos:** ejecuta `actualizacion_v5_cortes.sql` en el SQL Editor de Supabase **después** de la actualización v4. No borra ventas históricas.
2. Publica `index.html` y `app.js` de esta versión junto con los demás archivos del proyecto.
3. Cada empleado entra a **💵 Caja**, indica el nombre de turno y su fondo inicial, y pulsa **Abrir turno**. Sin turno abierto no se permiten nuevas ventas (regla aplicada en la base de datos).
4. En **💵 Caja** registra retiros (negativos) y entradas de efectivo (positivos) con motivo. Al cerrar, introduce el efectivo físico contado y observaciones.
5. La base de datos calcula **efectivo esperado = fondo inicial + ventas en efectivo + entradas − retiros** y **diferencia = contado − esperado**. Transferencias y tarjetas se informan por separado; no forman parte del efectivo esperado.
6. Un administrador puede consultar los turnos de todos los empleados. Los empleados únicamente pueden consultar sus propios turnos. El historial se exporta a CSV (hasta 500 turnos recientes por carga).

**Consideraciones:** cada usuario solo puede tener un turno abierto. Cada venta se asocia automáticamente al turno del empleado, incluso cuando varios venden a la vez. Las ventas anteriores a esta actualización no pertenecen a ningún turno. Los turnos cerrados conservan su corte calculado y no se pueden reabrir desde la interfaz. El sistema no incluye devoluciones, cancelaciones ni arqueo por denominaciones. Prueba el flujo completo en un proyecto Supabase de prueba antes de usarlo en producción.
