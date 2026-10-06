# MyBudget · Gestor de gastos personales

Aplicación web para controlar ingresos, gastos, presupuestos, gastos recurrentes y objetivos de ahorro.
Funciona **completamente en el navegador**: sin backend, sin servidor y sin base de datos. Los datos se guardan en **LocalStorage**.

Proyecto de DAW hecho con HTML5, CSS3 y JavaScript vanilla. Las gráficas usan [Chart.js](https://www.chartjs.org/) (licencia MIT) y la tipografía es [Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans) (licencia OFL). Las dos van incluidas en el proyecto, así que la app no hace ninguna petición a Internet.

---

## Cómo ejecutarlo

1. Descarga o clona el proyecto.
2. Abre `index.html` con doble clic en cualquier navegador moderno (Chrome, Edge, Firefox o Safari).

No hace falta instalar nada. La primera vez se cargan datos de ejemplo para que el dashboard no aparezca vacío. Puedes borrarlos desde el aviso del dashboard o desde **Configuración → Datos de ejemplo**.

> No necesita conexión: todo (gráficas y fuente incluidas) se carga desde los archivos del proyecto.
> Si prefieres servirla con un servidor local: `npx serve .` o la extensión *Live Server* de VS Code.

---

## Tests

Abre `tests/index.html` con doble clic en el navegador. Los tests se ejecutan al cargar la página y muestran el resultado de cada grupo; los fallidos aparecen desplegados con el valor esperado y el obtenido. El título de la pestaña también indica el resultado (por ejemplo, `✓ 48/48`).

No hace falta instalar nada: el runner (`tests/runner.js`) es propio y no tiene dependencias. Se prueban:

- `Utils.toCents`: formato español e inglés, miles, redondeo, números de JavaScript y entradas inválidas.
- `Utils.formatMoney` y `Utils.formatPercent`.
- `Recurring.occurrences`: todas las frecuencias, el día 31 en meses cortos y los años bisiestos.
- `Stats`: las funciones puras (`change`, `summarize`, `byCategory`) y los cálculos sobre un conjunto fijo de movimientos de 2024, para que los resultados no dependan del día en que se ejecutan.

La página de tests sustituye LocalStorage por un almacén en memoria antes de cargar la app. Es necesario porque, al abrir archivos con `file://`, todas las páginas comparten el mismo LocalStorage y los tests borrarían tus datos reales.

Para añadir un test, edita `tests/tests.js`:

```js
describe('Mi módulo', () => {
  it('hace algo', () => {
    equal(miFuncion(2), 4);           // igualdad (también arrays y objetos)
    close(porcentaje(1, 3), 33.333, 0.001); // números con decimales
    ok(condicion, 'mensaje si falla');
  });
});
```

---

## Estructura de carpetas

```text
MyBudget/
├── index.html               # Estructura HTML, modales y carga de scripts
├── README.md
├── assets/
│   ├── fonts/               # Plus Jakarta Sans (woff2) y su licencia (OFL.txt)
│   └── icons/
│       └── logo.svg         # Logo y favicon
├── css/
│   ├── style.css            # Variables de tema, layout, componentes y vistas
│   └── responsive.css       # Adaptación a portátil, tablet y móvil
└── js/
    ├── utils.js             # Dinero (céntimos), fechas, DOM y utilidades
    ├── icons.js             # Iconos SVG en línea
    ├── storage.js           # Única capa que lee y escribe en LocalStorage
    ├── ui.js                # Toasts, modales, confirmaciones y errores de formulario
    ├── categories.js        # Categorías predeterminadas y personalizadas
    ├── transactions.js      # Movimientos: formulario, historial, filtros y orden
    ├── budget.js            # Presupuesto mensual y límites por categoría
    ├── recurring.js         # Gastos recurrentes y próximos pagos
    ├── goals.js             # Objetivos de ahorro
    ├── statistics.js        # Cálculos puros (no tocan el DOM)
    ├── charts.js            # Gráficas con Chart.js
    ├── statistics-view.js   # Vista de "Estadísticas"
    ├── dashboard.js         # Vista del dashboard
    ├── settings.js          # Vista de "Configuración" (exportar, importar, borrar)
    ├── demo.js              # Datos de ejemplo
    ├── app.js               # Inicio, navegación SPA, tema, buscador y atajos
    └── vendor/
        └── chart.umd.min.js # Chart.js 4.4.1 (librería externa, licencia MIT)
tests/
├── index.html               # Página que ejecuta los tests y muestra los resultados
├── runner.js                # Mini test runner propio (describe, it, equal…)
└── tests.js                 # Tests de toCents, formatMoney, recurrentes y estadísticas
```

---

## Arquitectura

### Módulos sin frameworks
Cada archivo JS crea **un único objeto global** con el patrón *módulo* (una función que se ejecuta al momento):

```js
const Goals = (() => {
  function all() { /* … */ }   // privado salvo que se devuelva
  return { all, render };       // API pública
})();
```

No se usan módulos ES (`import`/`export`) porque los navegadores los bloquean al abrir un archivo con `file://`. Así la app funciona con un doble clic en `index.html`. Los scripts se cargan en orden al final de `index.html`.

### Flujo de datos

```
Formulario → módulo (Transactions, Budget…) → Store.set() → LocalStorage
                                                   │
                                                   └─→ avisa a App → App vuelve a pintar la vista actual
```

- **`Store` (storage.js)** es el único módulo que habla con LocalStorage. Guarda una copia en memoria, limpia y valida los datos al cargarlos o importarlos y avisa a sus suscriptores cada vez que algo cambia.
- **Sincronización entre pestañas**: `Store` escucha el evento `storage` de `window`, que el navegador lanza en las demás pestañas cuando una modifica LocalStorage. Al recibirlo, vuelve a leer la clave, la pasa por su sanitizer, actualiza la caché y avisa a los suscriptores, así que la otra pestaña se repinta sola. El tema también se sincroniza. Si dos pestañas modifican la misma colección a la vez, gana el último cambio.
- **`App` (app.js)** se suscribe a esos cambios y vuelve a pintar la vista activa. Por eso el dashboard, las gráficas y los presupuestos siempre muestran datos actualizados sin tener que llamarlos a mano.
- **`Stats` (statistics.js)** solo calcula: recibe datos y devuelve números. Las vistas y las gráficas usan esos resultados.
- **Acciones con `data-action`**: los botones generados dinámicamente llevan `data-action="edit-tx" data-id="…"`. Un único listener en `document` (app.js) busca la acción en un mapa que reúne las acciones de todos los módulos. Así no hay que añadir listeners a cada botón después de pintar.

### Diseño
- **Variables CSS** (`:root` en `style.css`): colores, sombras y radios se definen una sola vez. El tema oscuro solo redefine esas variables, también las de las gráficas.
- **Identidad**: índigo como color principal y lima como acento sobre fondos oscuros (barra lateral, tarjeta del saldo). Los ingresos van en verde; los gastos, en el color del texto, y el rojo se reserva para lo que requiere atención (presupuesto superado, exceso).
- **Cifras destacadas** con `UI.money()`: los céntimos y el símbolo `€` se muestran más pequeños (`1.250,50 €`) para que la cifra importante se lea de un vistazo.
- **Componentes reutilizables** en `ui.js`: `kpi`, `progressBar` (con marca de ritmo ideal), `ring` (anillo de progreso), `sparkline` (mini gráfica SVG), `dateTile` (fecha tipo calendario), `categoryChip`, `trendBadge`, `emptyState`…
- **Animaciones** solo al entrar en una sección (clase `.is-entering`); al cambiar los datos la vista se actualiza sin repetirlas. Se respetan las preferencias de movimiento reducido del sistema.

### Rendimiento
- **Sin peticiones externas**: la fuente y Chart.js son archivos locales, así que nada bloquea el primer pintado.
- **Índices en memoria** (`transactions.js`): los movimientos se agrupan por mes y por fecha una sola vez y solo se recalculan cuando cambia la lista. Las estadísticas ya no recorren todos los movimientos en cada consulta.
- **Repintado agrupado** (`app.js`): varios cambios seguidos de los datos producen un único repintado en el siguiente *frame* (`requestAnimationFrame`).
- **Gráficas reutilizadas** (`charts.js`): al repintar una vista no se destruye la gráfica. Se reutiliza su lienzo y se actualizan los datos, de modo que Chart.js anima la transición en lugar de redibujar desde cero.
- **Iconos en un sprite SVG** (`icons.js`): cada icono se define una vez y se reutiliza con `<use>`.

Con 5.000 movimientos, pintar cualquier sección tarda menos de 5 ms en un portátil actual.

### SPA con hash
Cada sección es un `<section class="view">` dentro de `index.html`. La URL usa el hash (`#/movimientos`, `#/objetivos`…) y al cambiarlo se muestra la vista correspondiente sin recargar la página. Los botones de atrás y adelante del navegador también funcionan.

### Dinero sin errores de decimales
Todas las cantidades se guardan como **céntimos enteros** (`12,50 €` → `1250`). Así se evitan errores como `0.1 + 0.2 = 0.30000000000000004`. `Utils.toCents()` convierte texto a céntimos usando solo enteros y `Utils.formatMoney()` muestra el formato español `1.250,50 €`. No se usa `Intl.NumberFormat` porque, en `es-ES`, no separa los miles en números de 4 cifras.

Los campos de cantidad son `type="text" inputmode="decimal"`, no `type="number"`. Así funcionan aunque el navegador no esté en español (con `type="number"`, "12,50" llegaba vacío) y en el móvil siguen mostrando el teclado numérico. `toCents()` interpreta el texto así:

| Entrada | Resultado | Regla |
|---|---|---|
| `12,50` · `12.50` · `12,5` | 12,50 € | Con un solo separador, la coma o el punto son decimales… |
| `2.000` · `1.250.000` | 2.000 € · 1.250.000 € | …salvo un punto seguido de exactamente 3 cifras, que son miles (como en español) |
| `1.250,50` · `1,250.50` | 1.250,50 € | Con los dos separadores, el último es el decimal |
| `0,005` · `12,345` | 0,01 € · 12,35 € | Se redondea al céntimo (mitad hacia arriba) |
| `1.2.3` · `12.50,30` · `abc` | Error | Los miles deben ir en grupos de 3 cifras |

Al editar, `Utils.centsToInput()` rellena el campo con coma decimal (`1250,50`).

### Seguridad
- Todo texto del usuario se inserta en el HTML con `Utils.escapeHTML()`, también los ids de los atributos `data-id` y `value`.
- Al cargar o importar datos, los sanitizers de `storage.js` solo aceptan ids que cumplan `/^[\w-]{1,64}$/` (letras, números, `_` y `-`) y eliminan los elementos con id duplicado. Así un `.json` manipulado no puede inyectar HTML ni scripts.

### Datos en LocalStorage
Cada colección se guarda en su propia clave:

| Clave | Contenido |
|---|---|
| `gestorGastos.transactions` | `[{ id, type, concept, amount, categoryId, date, method, notes, createdAt, recurringId? }]` |
| `gestorGastos.categories` | `[{ id, name, icon, type, color, custom }]` |
| `gestorGastos.budgets` | `{ monthly, byCategory: { [categoryId]: céntimos } }` |
| `gestorGastos.recurring` | `[{ id, name, amount, categoryId, day, frequency, startMonth, method, active }]` |
| `gestorGastos.goals` | `[{ id, name, icon, target, saved, deadline, createdAt }]` |
| `gestorGastos.settings` | `{ userName, demoLoaded, demoBannerHidden, schemaVersion }` |
| `gestorGastos.theme` | `"light"` o `"dark"` |

`recurringId` es opcional: lo añade "Registrar pago" para enlazar el movimiento con el gasto recurrente del que viene.

Los registros de ejemplo llevan `demo: true`. Así se pueden borrar sin tocar los datos que haya añadido el usuario. Si el usuario edita un registro de ejemplo, pierde esa marca y pasa a ser suyo.

---

## Funcionalidades implementadas

**Dashboard**
- Saldo actual acumulado, su variación en el mes y una mini gráfica con su evolución en los últimos 6 meses.
- Ingresos, gastos, ahorro y porcentaje de ahorro del mes seleccionado, con su tendencia respecto al mes anterior.
- Avisos de presupuesto superado.
- Gráfica de barras de ingresos y gastos de los últimos 6 meses y gráfica de gastos por categoría.
- Últimos movimientos, próximos pagos, presupuesto del mes, ranking de categorías con más gasto y objetivos.
- Botones de "Añadir gasto" y "Añadir ingreso".
- Resumen del gasto del mes en la barra lateral, visible desde cualquier sección.

**Movimientos**
- Alta, edición, duplicado y borrado (con confirmación) de gastos e ingresos. Tras borrar, el toast permite **deshacer**.
- Filtros automáticos por texto, tipo, categoría, método y rango de fechas.
- Orden por fecha, cantidad o categoría, desde las cabeceras de la tabla o desde un selector.
- Totales de los resultados filtrados y botón "Mostrar más".
- Exportación a **CSV** de los movimientos filtrados, preparada para Excel en español (separador `;`, coma decimal y UTF-8 con BOM).
- En móvil, la tabla se muestra como tarjetas y los filtros se pueden plegar.

**Categorías**
- 10 categorías de gasto y 5 de ingreso predeterminadas, cada una con icono y color.
- Categorías personalizadas con emoji y color. Se pueden editar y borrar; al borrarlas, sus movimientos pasan a "Otros".

**Presupuestos**
- Presupuesto mensual con barra de progreso de colores (verde, ámbar, rojo) y aviso al superarlo.
- Marca en la barra con el gasto "ideal" a día de hoy (el presupuesto repartido por igual cada día).
- Cantidad disponible por día para el resto del mes.
- Límites por categoría con lo gastado y lo disponible, y el aviso "Has superado tu presupuesto de ocio".
- Lista de categorías con gasto pero sin límite, con acceso directo para crear uno.

**Estadísticas**
- Gráficas de gastos por categoría, gastos diarios (con la línea del presupuesto diario) y evolución de 12 meses (ingresos, gastos y ahorro).
- Gasto medio diario y mensual, categoría con más gasto, mayor gasto individual, día con mayor gasto y totales del año.
- Resumen anual mes a mes. Al pulsar un mes, ese mes pasa a ser el seleccionado.

**Recurrentes**
- Frecuencia mensual, bimestral, trimestral, semestral o anual, con día del mes y mes del primer cobro.
- Próximo pago de cada uno, lista de los próximos 30 días y coste mensual y anual equivalente.
- Pausar o reactivar. "Registrar pago" abre el formulario de gasto ya relleno; los pagos no se ejecutan solos.

**Objetivos**
- Crear, editar y borrar objetivos con fecha límite opcional.
- Aportar o retirar dinero, con anillo de progreso y aviso al completar un objetivo.
- Cuánto hay que ahorrar al mes para llegar a la fecha límite.

**Configuración**
- Nombre para el saludo del dashboard y tema claro u oscuro.
- Exportar a `.json`, importar (con validación y confirmación) y borrar todos los datos (con confirmación).
- Exportar todos los movimientos a CSV.
- Cargar o borrar los datos de ejemplo y ver cuánto espacio ocupan los datos.

**Experiencia de usuario**
- Diseño responsive: sidebar en escritorio, menú desplegable en tablet y móvil, modales tipo *bottom sheet* en móvil, buscador plegable y botón flotante para añadir.
- Modo claro y oscuro, que también se aplica a las gráficas.
- Toasts (como máximo 3 a la vez), confirmaciones, estados vacíos, estado de carga y validaciones con mensajes bajo cada campo.
- Las cantidades aceptan coma o punto decimal y separadores de miles, en cualquier idioma del navegador.
- Si la app está abierta en varias pestañas, los cambios de una se ven al momento en las demás.
- Buscador global (movimientos, objetivos, recurrentes y secciones) que se puede usar con las flechas del teclado.
- Selector de mes en la barra superior.
- Atajos de teclado: `N` gasto, `I` ingreso, `/` o `Ctrl+K` buscar, `1`–`7` secciones, `←` `→` cambiar de mes, `T` tema, `?` ayuda.

---

## Posibles mejoras futuras

- Convertir la app en PWA (manifest y *service worker*) para poder instalarla en el móvil o el escritorio. Requiere servirla desde un servidor web, porque los *service workers* no funcionan con `file://`.
- Registrar automáticamente los pagos recurrentes vencidos, preguntando antes al usuario.
- Presupuestos distintos para cada mes y traspaso del sobrante al mes siguiente.
- Varias cuentas o carteras (banco, efectivo, tarjeta) con traspasos entre ellas.
- Importar movimientos desde un CSV, por ejemplo el extracto del banco.
- Gráficas comparativas entre años e informe en PDF.
- Deshacer también al borrar objetivos, recurrentes y límites.
- Tests de las vistas (renderizado y formularios), que ahora se prueban a mano.
- Avisar si dos pestañas editan la misma colección a la vez, en lugar de quedarse con el último cambio.
- Sincronizar entre dispositivos con un backend opcional.
