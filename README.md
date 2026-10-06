# MyBudget · Gestor de gastos personales

Aplicación web para controlar ingresos, gastos, presupuestos, gastos recurrentes y objetivos de ahorro.
Funciona **completamente en el navegador**: sin backend, sin servidor y sin base de datos. Los datos se guardan en **LocalStorage**.

Proyecto de DAW hecho con HTML5, CSS3 y JavaScript vanilla. Las gráficas usan [Chart.js](https://www.chartjs.org/) (licencia MIT), incluido en el proyecto en `js/vendor/`, así que funcionan sin conexión.

---

## Cómo ejecutarlo

1. Descarga o clona el proyecto.
2. Abre `index.html` con doble clic en cualquier navegador moderno (Chrome, Edge, Firefox o Safari).

No hace falta instalar nada. La primera vez se cargan datos de ejemplo para que el dashboard no aparezca vacío. Puedes borrarlos desde el aviso del dashboard o desde **Configuración → Datos de ejemplo**.

> Sin conexión todo sigue funcionando, gráficas incluidas. Lo único que se carga de Internet es la fuente Plus Jakarta Sans; si no está disponible, se usa la fuente del sistema.
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
- **`App` (app.js)** se suscribe a esos cambios y vuelve a pintar la vista activa. Por eso el dashboard, las gráficas y los presupuestos siempre muestran datos actualizados sin tener que llamarlos a mano.
- **`Stats` (statistics.js)** solo calcula: recibe datos y devuelve números. Las vistas y las gráficas usan esos resultados.
- **Acciones con `data-action`**: los botones generados dinámicamente llevan `data-action="edit-tx" data-id="…"`. Un único listener en `document` (app.js) busca la acción en un mapa que reúne las acciones de todos los módulos. Así no hay que añadir listeners a cada botón después de pintar.

### SPA con hash
Cada sección es un `<section class="view">` dentro de `index.html`. La URL usa el hash (`#/movimientos`, `#/objetivos`…) y al cambiarlo se muestra la vista correspondiente sin recargar la página. Los botones de atrás y adelante del navegador también funcionan.

### Dinero sin errores de decimales
Todas las cantidades se guardan como **céntimos enteros** (`12,50 €` → `1250`). Así se evitan errores como `0.1 + 0.2 = 0.30000000000000004`. `Utils.toCents()` convierte texto a céntimos usando solo enteros y `Utils.formatMoney()` muestra el formato español `1.250,50 €`. No se usa `Intl.NumberFormat` porque, en `es-ES`, no separa los miles en números de 4 cifras.

### Datos en LocalStorage
Cada colección se guarda en su propia clave:

| Clave | Contenido |
|---|---|
| `gestorGastos.transactions` | `[{ id, type, concept, amount, categoryId, date, method, notes, createdAt }]` |
| `gestorGastos.categories` | `[{ id, name, icon, type, color, custom }]` |
| `gestorGastos.budgets` | `{ monthly, byCategory: { [categoryId]: céntimos } }` |
| `gestorGastos.recurring` | `[{ id, name, amount, categoryId, day, frequency, startMonth, method, active }]` |
| `gestorGastos.goals` | `[{ id, name, icon, target, saved, deadline, createdAt }]` |
| `gestorGastos.settings` | `{ userName, demoLoaded, demoBannerHidden, schemaVersion }` |
| `gestorGastos.theme` | `"light"` o `"dark"` |

Los registros de ejemplo llevan `demo: true`. Así se pueden borrar sin tocar los datos que haya añadido el usuario. Si el usuario edita un registro de ejemplo, pierde esa marca y pasa a ser suyo.

---

## Funcionalidades implementadas

**Dashboard**
- Saldo actual acumulado, ingresos, gastos, ahorro y porcentaje de ahorro del mes seleccionado.
- Tendencia de cada indicador respecto al mes anterior.
- Avisos de presupuesto superado.
- Gráfica de evolución de 6 meses y gráfica de gastos por categoría.
- Últimos movimientos, próximos pagos, presupuesto del mes, categorías con más gasto y objetivos.
- Botones de "Añadir gasto" y "Añadir ingreso".

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
- Aportar o retirar dinero, con barra de progreso y aviso al completar un objetivo.
- Cuánto hay que ahorrar al mes para llegar a la fecha límite.

**Configuración**
- Nombre para el saludo del dashboard y tema claro u oscuro.
- Exportar a `.json`, importar (con validación y confirmación) y borrar todos los datos (con confirmación).
- Exportar todos los movimientos a CSV.
- Cargar o borrar los datos de ejemplo y ver cuánto espacio ocupan los datos.

**Experiencia de usuario**
- Diseño responsive: sidebar en escritorio, menú desplegable en tablet y móvil, modales tipo *bottom sheet* en móvil y botón flotante para añadir.
- Modo claro y oscuro, que también se aplica a las gráficas.
- Toasts, confirmaciones, estados vacíos, estado de carga y validaciones con mensajes bajo cada campo.
- Buscador global (movimientos, objetivos, recurrentes y secciones) que se puede usar con las flechas del teclado.
- Selector de mes en la barra superior.
- Atajos de teclado: `N` gasto, `I` ingreso, `/` o `Ctrl+K` buscar, `1`–`7` secciones, `←` `→` cambiar de mes, `T` tema, `?` ayuda.

---

## Posibles mejoras futuras

- Convertir la app en PWA (manifest y *service worker*) para instalarla y usarla sin conexión.
- Registrar automáticamente los pagos recurrentes vencidos, preguntando antes al usuario.
- Presupuestos distintos para cada mes y traspaso del sobrante al mes siguiente.
- Varias cuentas o carteras (banco, efectivo, tarjeta) con traspasos entre ellas.
- Importar movimientos desde un CSV, por ejemplo el extracto del banco.
- Gráficas comparativas entre años e informe en PDF.
- Deshacer también al borrar objetivos, recurrentes y límites.
- Tests automáticos de los cálculos de `statistics.js` y `utils.js`.
- Sincronizar entre dispositivos con un backend opcional.
