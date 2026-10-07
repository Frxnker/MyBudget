# MyBudget · Gestor de finanzas personales

**Versión 1.1**

MyBudget es una aplicación web para controlar tus finanzas personales: ingresos, gastos, presupuestos, gastos recurrentes, objetivos de ahorro, estadísticas, comparaciones entre meses e informes mensuales.

Funciona **completamente en el navegador**: sin backend, sin servidor, sin base de datos externa y sin cuentas de usuario. Los datos se guardan en tu navegador (**LocalStorage**, y las imágenes de los recibos en **IndexedDB**) y nunca salen de tu dispositivo.

Proyecto de DAW hecho con HTML5, CSS3 y JavaScript vanilla.

---

## Nuevas características v1.1

**Dashboard**
- **Dinero disponible**: además del saldo actual, muestra los pagos recurrentes pendientes y el dinero realmente disponible (saldo − pagos próximos). Se configura en *Configuración* (hasta final de mes, 7 días, 30 días o desactivado) y nunca modifica el saldo real.
- **Comparación con el mes anterior** en cada indicador (ingresos, gastos, ahorro y tasa de ahorro) con flecha, porcentaje y el valor anterior. En el mes en curso se compara con **el mismo periodo** del mes anterior (del 1 al 7 de octubre frente al 1 al 7 de septiembre), para no comparar unos pocos días con un mes completo.
- **Gráfica de evolución** con selector de periodo (**7 días, 30 días, 3 meses, 6 meses y 1 año**): barras de ingresos y gastos y línea del saldo acumulado en un segundo eje. Recuerda el periodo elegido.
- **Sistema de avisos** (ver más abajo) y **consejos automáticos**.
- **Próximos pagos** con importe, frecuencia y días restantes ("en 3 días"), sin incluir los ya pagados.

**Presupuesto inteligente**
- Presupuesto, gastado, restante, **días restantes**, **gasto recomendado por día**, tu media diaria y la **previsión de fin de mes** ("Al ritmo actual terminarás el mes gastando aproximadamente X €").
- Mensaje de estado: "Estás gastando más rápido de lo recomendado" o "Tu gasto está dentro del presupuesto previsto".
- La previsión separa los **gastos fijos** (pagos recurrentes) de los variables: el alquiler del día 1 no hace creer que vas a gastar 30 veces esa cantidad. Los recurrentes pendientes se reservan del gasto recomendado.
- Cada límite por categoría indica cuánto puedes gastar al día hasta final de mes.

**Sistema de avisos** (calculados al momento, sin notificaciones externas)
- Más del 80 % de un presupuesto usado y presupuesto superado (mensual y por categoría).
- Gasto diario por encima del recomendado.
- Categorías cuyo gasto aumenta considerablemente (≥ 30 % y ≥ 20 €).
- Pagos recurrentes en los próximos 7 días.
- Tasa de ahorro que mejora o empeora (≥ 5 puntos) y gasto total que baja o sube respecto al mes anterior.
- Se muestran los 3 más importantes y el resto con "Ver más". Siempre con icono y texto, no solo color.

**Comparación mensual** (nueva sección *Comparar*)
- Elige dos meses cualesquiera (o "Mes actual vs. anterior" / "Mismo mes del año anterior").
- Compara ingresos, gastos, ahorro, tasa de ahorro, número de movimientos y gasto medio diario, en euros y en porcentaje.
- Gasto e ingreso por categoría con gráfica y tabla de diferencias.

**Buscador**
- Busca por descripción, notas, categoría, **importe** y **tipo**: "Amazon", "gasolina", "alimentación" (con o sin tilde), "50" (de 50,00 € a 50,99 €), "12,50" (exacto), "gasto" o "ingreso". Varias palabras se combinan ("amazon 30").
- Funciona junto con los filtros existentes y en el buscador global (que ahora también encuentra categorías).

**Duplicar movimientos**
- "Duplicar" crea al instante una copia con la **fecha de hoy** (mismo importe, categoría, descripción, tipo, método y notas). El aviso permite editarla.

**Objetivos de ahorro**
- Cantidad restante, porcentaje, **mes objetivo**, cuánto ahorrar **al mes** y **a la semana** y si **vas al ritmo necesario** (con una marca en la barra que indica lo que deberías llevar ahorrado hoy).

**Consejos financieros automáticos** (análisis local, sin IA externa)
- Cambios por categoría, evolución de la tasa de ahorro, peso de los gastos recurrentes, categoría con mayor gasto, reducción o aumento del gasto varios meses seguidos, día de la semana en que más gastas y cuándo podrías completar un objetivo con tu ahorro medio. Solo aparecen si hay datos suficientes.

**Informe mensual** (nueva sección *Informe*)
- Resumen (ingresos, gastos, ahorro, tasa, gasto medio diario), comparación con el mes anterior, categorías con mayor gasto, presupuestos, objetivos, pagos recurrentes y avisos y consejos.
- **Exportación a PDF** con el diálogo de impresión del navegador ("Guardar como PDF"), siempre con colores claros. También se pueden exportar los movimientos del mes a CSV.

**Recibos**
- "Añadir recibo" al crear o editar un movimiento (JPG, JPEG, PNG o WEBP, máx. 10 MB). La imagen se **reduce** (1600 px) y se **comprime** antes de guardarla.
- "Ver recibo" desde el historial (icono del clip) con opción de descargar o **eliminar** el recibo.
- Se guardan solo en el navegador (IndexedDB, o LocalStorage si no está disponible) y nunca se suben a ningún servidor. Configuración muestra cuánto espacio ocupan.

**Gastos recurrentes**
- La app detecta qué cobros ya están **pagados** (con "Registrar pago" o con un gasto de la misma categoría e importe ese mes): las tarjetas muestran "Pago de octubre registrado" o "Pago sin registrar" y los pagados no aparecen como pendientes.

**Categorías**
- Las predeterminadas también se pueden **editar** (nombre, icono y color).
- Colores sugeridos además del selector de color.
- Al eliminar una categoría con movimientos, **eliges a qué categoría pasan** antes de borrarla.
- **Estadísticas de cada categoría**: este mes, comparación, media de 6 meses, peso, número de movimientos, último movimiento, gráfica de 6 meses y límite de presupuesto.

**Estadísticas**
- Tabla de gasto por categoría (mes, % del total, variación, media de 6 meses y límite), ingresos por categoría y tasa de ahorro del mes. Accesos directos a *Comparar* e *Informe*.

**Datos, importación y exportación**
- Formato de datos **versionado** (`schemaVersion: 2`) con **migraciones automáticas**: los datos de la v1.0 se actualizan al abrir la app sin perder nada y antes se guarda una **copia previa** (descargable desde Configuración).
- La copia de seguridad incluye también los **recibos**, la versión de la app y del formato.
- Antes de importar se **valida** el archivo, se informa de los errores y se muestra una **vista previa** (qué contiene y qué se descartará) con la opción de descargar antes tus datos actuales.
- La importación es **atómica**: si no cabe todo, no se modifica nada.

**Instalable en el móvil**
- Icono propio para iOS y Android y `manifest.webmanifest`: se añade a la pantalla de inicio con el icono de MyBudget y se abre a pantalla completa (ver *Instalarla en el móvil*).

**Accesibilidad, UX y rendimiento**
- Enlace "Saltar al contenido", tablas con título para lectores de pantalla, selectores con `aria-pressed`, avisos sin `role="alert"` repetitivo, foco visible en todos los controles nuevos y estados (subidas, bajadas, avisos) indicados con icono y texto además del color.
- Campos deshabilitados claramente visibles y mensajes de error bajo cada campo (también para imágenes).
- Modo oscuro en todas las secciones nuevas; diseño adaptado a escritorio, tablet y móvil (en móvil las tablas nuevas se convierten en tarjetas).
- Cálculos estadísticos **memorizados** hasta que cambian los datos, búsqueda con texto precalculado por movimiento e imágenes fuera de LocalStorage.

---

## Cómo ejecutarlo

1. Descarga o clona el proyecto: `git clone https://github.com/Frxnker/MyBudget.git`
2. Abre `index.html` con doble clic en cualquier navegador moderno (Chrome, Edge, Firefox o Safari).

No hace falta instalar nada ni tener conexión: la fuente y Chart.js van incluidas en el proyecto. La primera vez se cargan datos de ejemplo para que el dashboard no aparezca vacío; puedes borrarlos desde el aviso del dashboard o desde **Configuración → Datos de ejemplo**.

> Si prefieres servirla con un servidor local: `npx serve .` o la extensión *Live Server* de VS Code.

### Instalarla en el móvil (icono en la pantalla de inicio)

La app tiene icono propio y un *manifest* (`manifest.webmanifest`), así que se puede añadir a la pantalla de inicio y se abre a pantalla completa, sin la barra del navegador, como una app:

- **Android (Chrome)**: menú ⋮ → *Añadir a pantalla de inicio* o *Instalar aplicación*.
- **iPhone / iPad (Safari)**: botón *Compartir* → *Añadir a pantalla de inicio*.

Para esto la app tiene que estar publicada en una web (por ejemplo, GitHub Pages) o servida con un servidor local: un archivo abierto con `file://` no se puede instalar. Los datos se guardan en el navegador del móvil, igual que en el ordenador.

| Archivo | Uso |
|---|---|
| `assets/icons/logo.svg` | Favicon (navegadores que admiten SVG) e icono del manifest |
| `assets/icons/favicon-32.png` | Favicon para los navegadores que no admiten SVG |
| `assets/icons/apple-touch-icon.png` | Icono de iOS (180 × 180, a sangre: iOS redondea las esquinas) |
| `assets/icons/icon-192.png` · `icon-512.png` | Iconos de Android |
| `assets/icons/icon-maskable-512.png` | Icono adaptable de Android (el gráfico queda dentro de la zona segura de la máscara) |
| `assets/icons/app-icon.svg` | Origen de los iconos a sangre (`apple-touch-icon` y `maskable`) |

Si cambias el logo, vuelve a generar los PNG desde `logo.svg` (versión con esquinas redondeadas) y `app-icon.svg` (a sangre) en esos mismos tamaños.

### Uso rápido

| Quiero… | Dónde |
|---|---|
| Añadir un gasto o ingreso | Botón **Añadir** (o tecla `N` / `I`) |
| Adjuntar un recibo | Formulario del movimiento → **Añadir recibo** |
| Repetir un gasto frecuente | Movimientos → **Duplicar** (copia con la fecha de hoy) |
| Saber cuánto puedo gastar al día | **Presupuestos** (o la tarjeta del dashboard) |
| Ver dinero disponible real | Dashboard (se configura en **Configuración**) |
| Comparar dos meses | **Comparar** (tecla `7`) |
| Generar un PDF del mes | **Informe** → *Imprimir o guardar PDF* (tecla `8`) |
| Hacer una copia de seguridad | **Configuración → Exportar datos** |

**Atajos de teclado**: `N` gasto, `I` ingreso, `/` o `Ctrl+K` buscar, `1`–`9` secciones, `←` `→` cambiar de mes, `T` tema, `?` ayuda, `Esc` cerrar.

> En la v1.1 se han añadido dos secciones. Los atajos `1`–`6` no cambian; *Comparar* es el `7`, *Informe* el `8` y *Configuración* pasa del `7` al `9`.

---

## Tecnologías

- **HTML5, CSS3 y JavaScript vanilla** (sin frameworks ni proceso de compilación).
- **[Chart.js](https://www.chartjs.org/) 4.4.1** (licencia MIT), incluido en `js/vendor/`.
- **[Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans)** (licencia OFL), incluida en `assets/fonts/`.
- **LocalStorage** para los datos e **IndexedDB** para las imágenes de los recibos.
- Sin dependencias nuevas en la v1.1: el PDF se genera con la impresión del navegador y las imágenes se comprimen con `<canvas>`.

---

## Tests

Abre `tests/index.html` con doble clic en el navegador. Los tests se ejecutan al cargar la página y muestran el resultado de cada grupo; los fallidos aparecen desplegados con el valor esperado y el obtenido. El título de la pestaña también indica el resultado (por ejemplo, `✓ 125/125`).

No hace falta instalar nada: el runner (`tests/runner.js`) es propio y no tiene dependencias. Admite tests síncronos (`it`) y asíncronos (`itAsync`, que se ejecutan uno detrás de otro al final). La página sustituye LocalStorage por un almacén en memoria antes de cargar la app, porque al abrir archivos con `file://` todas las páginas comparten el mismo LocalStorage y los tests borrarían tus datos reales.

| Archivo | Qué prueba |
|---|---|
| `tests/tests.js` | `Utils.toCents`, `formatMoney`, `formatPercent`, `Recurring.occurrences` (frecuencias, día 31, bisiestos) y `Stats` sobre un conjunto fijo de 2024 |
| `tests/finance-tests.js` | Comparación y tasa de ahorro, presupuesto inteligente (restante, días, gasto recomendado, previsión, fijos y variables), dinero disponible, objetivos (al mes, a la semana, ritmo, vencidos), tramos y saldo de la gráfica de evolución, pagos recurrentes registrados, avisos, consejos y comparación mensual |
| `tests/data-tests.js` | Migración v1 → v2 (con copia previa, JSON dañado y versiones más recientes), validación e importación/exportación (atómica, recibos, ids maliciosos), búsqueda (texto, tildes, importe, tipo, filtros), duplicado de movimientos, validaciones y recibos (guardar, limpiar, comprimir, rechazar formatos) |

Para añadir un test:

```js
describe('Mi módulo', () => {
  it('hace algo', () => {
    equal(miFuncion(2), 4);                 // igualdad (también arrays y objetos)
    close(porcentaje(1, 3), 33.333, 0.001); // números con decimales
    ok(condicion, 'mensaje si falla');
  });
  itAsync('lee algo', async () => {
    equal(await leer(), 'valor');
  });
});
```

Los cálculos financieros están en módulos sin DOM (`finance.js`, `statistics.js`, `Alerts.build`, `Insights.build`, `migrations.js`, `validation.js`), así que se prueban sin interfaz.

---

## Estructura de carpetas

```text
MyBudget/
├── index.html               # Estructura HTML, modales y carga de scripts
├── manifest.webmanifest     # Nombre, icono y colores al instalarla en el móvil
├── README.md
├── assets/
│   ├── fonts/               # Plus Jakarta Sans (woff2) y su licencia (OFL.txt)
│   └── icons/               # Logo y favicon (SVG), iconos PNG para iOS y Android
├── css/
│   ├── style.css            # Variables de tema, layout, componentes, vistas e impresión
│   └── responsive.css       # Adaptación a portátil, tablet y móvil
├── js/
│   ├── utils.js             # Dinero (céntimos), fechas, DOM y utilidades
│   ├── icons.js             # Iconos SVG en línea (sprite)
│   ├── validation.js        # Validaciones sin DOM (importes, fechas, imágenes)         · v1.1
│   ├── finance.js           # Cálculos financieros puros (presupuesto, objetivos…)      · v1.1
│   ├── migrations.js        # Migraciones del formato de datos                          · v1.1
│   ├── storage.js           # Única capa que lee y escribe en LocalStorage (versiones, importación)
│   ├── ui.js                # Toasts, modales, confirmaciones, errores y bloques HTML
│   ├── receipts.js          # Recibos: almacenamiento, compresión y visor              · v1.1
│   ├── categories.js        # Categorías, borrado con reasignación y estadísticas
│   ├── transactions.js      # Movimientos: formulario, recibos, búsqueda, filtros e historial
│   ├── budget.js            # Presupuesto mensual inteligente y límites por categoría
│   ├── recurring.js         # Gastos recurrentes, pagos registrados y pendientes
│   ├── goals.js             # Objetivos de ahorro y su plan
│   ├── statistics.js        # Cálculos sobre los movimientos (con memoria de resultados)
│   ├── alerts.js            # Sistema de avisos                                         · v1.1
│   ├── insights.js          # Consejos financieros automáticos                          · v1.1
│   ├── charts.js            # Gráficas con Chart.js
│   ├── statistics-view.js   # Vista "Estadísticas"
│   ├── compare-view.js      # Vista "Comparar"                                          · v1.1
│   ├── report.js            # Vista "Informe" (imprimible / PDF)                        · v1.1
│   ├── dashboard.js         # Vista del dashboard
│   ├── settings.js          # Vista "Configuración" (preferencias, exportar, importar, borrar)
│   ├── demo.js              # Datos de ejemplo
│   ├── app.js               # Inicio, navegación SPA, tema, buscador global y atajos
│   └── vendor/chart.umd.min.js
└── tests/
    ├── index.html           # Página que ejecuta los tests
    ├── runner.js            # Mini test runner propio (describe, it, itAsync, equal…)
    ├── tests.js             # Dinero, recurrentes y estadísticas
    ├── finance-tests.js     # Cálculos financieros, avisos y consejos                   · v1.1
    └── data-tests.js        # Migración, importación, búsqueda, duplicado y recibos     · v1.1
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

### Capas

```
Datos           storage.js (LocalStorage) · receipts.js (IndexedDB) · migrations.js
Validación      validation.js
Lógica          finance.js (puro) · statistics.js · alerts.js / insights.js (build puro)
Estado y UI     transactions, budget, recurring, goals, categories (datos + formularios)
Vistas          dashboard, statistics-view, compare-view, report, settings
Arranque        app.js (navegación, acciones, atajos)
```

### Flujo de datos

```
Formulario → módulo (Transactions, Budget…) → Store.set() → LocalStorage
                                                   │
                                                   └─→ avisa a App → App vuelve a pintar la vista actual
```

- **`Store` (storage.js)** es el único módulo que habla con LocalStorage. Guarda una copia en memoria, migra los datos antiguos, limpia y valida los datos al cargarlos o importarlos y avisa a sus suscriptores cada vez que algo cambia.
- **Sincronización entre pestañas**: `Store` escucha el evento `storage` de `window`, que el navegador lanza en las demás pestañas cuando una modifica LocalStorage, y la otra pestaña se repinta sola. Si dos pestañas modifican la misma colección a la vez, gana el último cambio.
- **`Finance` (finance.js)** solo calcula: recibe números y listas y devuelve resultados. `Stats`, `Budget`, `Recurring`, `Goals`, `Alerts` e `Insights` reúnen los datos y lo usan.
- **Acciones con `data-action`**: los botones generados dinámicamente llevan `data-action="edit-tx" data-id="…"`. Un único listener en `document` (app.js) busca la acción en un mapa que reúne las acciones de todos los módulos.

### Cómo se calcula…

| Dato | Cálculo |
|---|---|
| Saldo actual | Ingresos − gastos con fecha hasta hoy |
| Dinero disponible | Saldo − pagos recurrentes pendientes hasta el horizonte elegido |
| Gasto recomendado/día | (Restante − recurrentes pendientes del mes) / días que quedan (con hoy) |
| Previsión de fin de mes | Gastado + recurrentes pendientes + media diaria de los gastos variables × días restantes |
| Pago recurrente "pagado" | Hay un gasto ese mes enlazado con él (`recurringId`) o, si no, uno sin enlazar de la misma categoría e importe |
| Ritmo de un objetivo | Lineal desde lo ahorrado al crearlo (`startSaved`, `createdAt`) hasta la meta en la fecha objetivo; margen del 1 % |
| Comparación del mes en curso | Mismo periodo del mes anterior (del día 1 al día de hoy) |

### Diseño
- **Variables CSS** (`:root` en `style.css`): colores, sombras y radios se definen una sola vez. El tema oscuro solo redefine esas variables, también las de las gráficas. Al imprimir se fuerzan las del tema claro.
- **Identidad**: índigo como color principal y lima como acento sobre fondos oscuros. Los ingresos van en verde; los gastos, en el color del texto, y el rojo se reserva para lo que requiere atención.
- **Componentes reutilizables** en `ui.js`: `kpi`, `progressBar` (con marca), `ring`, `sparkline`, `dateTile`, `categoryChip`, `trendBadge`, `compareFoot`, `statusNote`, `choiceGroup`, `emptyState`…
- **Animaciones** solo al entrar en una sección; se respetan las preferencias de movimiento reducido.

### Rendimiento
- **Sin peticiones externas**: la fuente y Chart.js son archivos locales.
- **Índices en memoria** (`transactions.js`): los movimientos se agrupan por mes y por fecha una sola vez y solo se recalculan cuando cambia la lista.
- **Memoria de resultados** (`statistics.js`): resúmenes, categorías y la evolución se calculan una vez por versión de los datos (y por día). Las vistas los piden muchas veces en cada pintado.
- **Búsqueda**: el texto de búsqueda de cada movimiento se calcula una vez y se reutiliza.
- **Repintado agrupado** (`app.js`) y **gráficas reutilizadas** (`charts.js`): se actualizan los datos de la gráfica existente en lugar de crearla de nuevo.
- **Recibos fuera de LocalStorage**: se guardan aparte y solo se leen al verlos.

### Dinero sin errores de decimales
Todas las cantidades se guardan como **céntimos enteros** (`12,50 €` → `1250`). `Utils.toCents()` convierte texto a céntimos usando solo enteros y `Utils.formatMoney()` muestra el formato español `1.250,50 €`.

Los campos de cantidad son `type="text" inputmode="decimal"`. `toCents()` interpreta el texto así:

| Entrada | Resultado | Regla |
|---|---|---|
| `12,50` · `12.50` · `12,5` | 12,50 € | Con un solo separador, la coma o el punto son decimales… |
| `2.000` · `1.250.000` | 2.000 € · 1.250.000 € | …salvo un punto seguido de exactamente 3 cifras, que son miles |
| `1.250,50` · `1,250.50` | 1.250,50 € | Con los dos separadores, el último es el decimal |
| `0,005` · `12,345` | 0,01 € · 12,35 € | Se redondea al céntimo (mitad hacia arriba) |
| `1.2.3` · `12.50,30` · `abc` | Error | Los miles deben ir en grupos de 3 cifras |

### Seguridad
- Todo texto del usuario se inserta en el HTML con `Utils.escapeHTML()`, también los ids de los atributos `data-id` y `value`.
- Al cargar o importar datos, los sanitizers de `storage.js` solo aceptan ids que cumplan `/^[\w-]{1,64}$/` y eliminan los duplicados.
- Los recibos importados solo se aceptan si son imágenes JPEG, PNG o WEBP en base64 (no SVG, que puede contener scripts).

---

## Almacenamiento local

Cada colección se guarda en su propia clave de LocalStorage:

| Clave | Contenido |
|---|---|
| `gestorGastos.transactions` | `[{ id, type, concept, amount, categoryId, date, method, notes, createdAt, recurringId?, receiptId? }]` |
| `gestorGastos.categories` | `[{ id, name, icon, type, color, custom }]` |
| `gestorGastos.budgets` | `{ monthly, byCategory: { [categoryId]: céntimos } }` |
| `gestorGastos.recurring` | `[{ id, name, amount, categoryId, day, frequency, startMonth, method, active }]` |
| `gestorGastos.goals` | `[{ id, name, icon, target, saved, startSaved, deadline, createdAt }]` |
| `gestorGastos.settings` | `{ userName, demoLoaded, demoBannerHidden, availableHorizon, chartRange, schemaVersion }` |
| `gestorGastos.theme` | `"light"` o `"dark"` |
| `gestorGastos.migrationBackup` | Copia de los datos anteriores a la última migración (si la hubo) |

Las imágenes de los recibos se guardan en **IndexedDB** (base de datos `mybudget`, almacén `receipts`: `{ id, dataUrl, width, height, createdAt }`). Si el navegador no permite usar IndexedDB, se guardan en LocalStorage con claves `gestorGastos.receipt.<id>`. Los movimientos solo guardan el `receiptId`. Al abrir la app se borran las imágenes que ya no usa ningún movimiento.

- `recurringId` es opcional: lo añade "Registrar pago" para enlazar el movimiento con su gasto recurrente.
- Los registros de ejemplo llevan `demo: true` para poder borrarlos sin tocar los datos del usuario.

### Versiones y migraciones

`settings.schemaVersion` indica con qué formato se guardaron los datos:

| Versión | App | Cambios |
|---|---|---|
| 1 | MyBudget 1.0 | Formato inicial |
| 2 | MyBudget 1.1 | `goals[].startSaved`, `settings.availableHorizon`, `settings.chartRange` y `transactions[].receiptId` (opcional) |

Al abrir la app con datos de una versión anterior:
1. Se guarda una copia de los datos tal y como estaban (`gestorGastos.migrationBackup`), que se puede descargar o eliminar desde *Configuración*.
2. Se aplican en orden las migraciones de `migrations.js` (solo añaden campos; nunca borran información).
3. Los datos se validan y se guardan con la versión nueva de una sola vez; si no se pueden guardar, los originales siguen intactos y se vuelve a intentar al abrir la app. Una clave con JSON dañado no se sobrescribe nunca.

Para un cambio futuro basta con subir `Store.SCHEMA_VERSION`, añadir el paso en `Migrations` (`3(data) { … }`) y su test.

---

## Importación y exportación

- **Exportar datos** (Configuración): descarga un `.json` con `app`, `appVersion`, `schemaVersion`, `exportedAt` y `data` (movimientos, categorías, presupuestos, recurrentes, objetivos, configuración, tema y **recibos**). Es todo lo necesario para reconstruir la app.
- **Importar datos**:
  1. Se valida el archivo (JSON correcto, lista de movimientos, formato de cada sección, versión no posterior a la de la app) y se informa de cualquier error.
  2. Se migra si es de una versión anterior y se limpian los registros no válidos.
  3. Se muestra una **vista previa** con lo que contiene y lo que se descartará, y la opción de descargar antes una copia de tus datos actuales.
  4. Solo al confirmar se reemplazan los datos, de forma **atómica** (si el almacenamiento está lleno no se cambia nada).
- **CSV**: los movimientos filtrados (Movimientos), todos (Configuración) o los del mes (Informe), preparados para Excel en español (separador `;`, coma decimal y UTF-8 con BOM).
- **PDF**: Informe → *Imprimir o guardar PDF*.

---

## Funciones principales

**Dashboard**: saldo actual y dinero disponible, evolución del saldo, ingresos, gastos, ahorro y tasa de ahorro con comparación, avisos, gráfica de evolución por periodos, gastos por categoría, últimos movimientos, próximos pagos, presupuesto inteligente, ranking de categorías, objetivos y consejos.

**Movimientos**: alta, edición, duplicado y borrado (con deshacer); recibos; buscador por texto, categoría, importe y tipo; filtros por tipo, categoría, método y fechas; orden por fecha, cantidad o categoría; totales; exportación a CSV. En móvil, tarjetas con menú de acciones.

**Presupuestos**: presupuesto mensual inteligente y límites por categoría con estado, gasto diario disponible y lista de categorías con gasto pero sin límite.

**Objetivos**: crear, editar, borrar, aportar y retirar; progreso, restante, necesario al mes y a la semana, ritmo y fecha objetivo.

**Recurrentes**: frecuencia mensual, bimestral, trimestral, semestral o anual; próximo pago y días restantes; pagos registrados; coste mensual y anual; pausar; "Registrar pago".

**Estadísticas**: gastos por categoría, gastos diarios con presupuesto diario, evolución de 12 meses, detalle por categoría, ingresos por categoría, medias, mayor gasto, categoría y día con mayor gasto, resumen anual mes a mes.

**Comparar** e **Informe**: ver "Nuevas características v1.1".

**Configuración**: nombre, tema, dinero disponible, categorías, exportar/importar, copia previa a la actualización, datos de ejemplo, espacio ocupado y borrar todo.

---

## Capturas

El proyecto no incluye capturas de pantalla. Para ver la aplicación basta con abrir `index.html`: los datos de ejemplo muestran todas las secciones.

---

## Roadmap

### Posibles mejoras para v1.2
- **Service worker** para que la app instalada abra sin conexión aunque el navegador haya borrado su caché (el icono y el *manifest* ya están). Requiere servirla desde un servidor web, porque los *service workers* no funcionan con `file://`.
- **Ingresos recurrentes** (nómina) para prever también lo que va a entrar y calcular el saldo a final de mes.
- Registrar automáticamente los pagos recurrentes vencidos, preguntando antes al usuario.
- **Presupuestos distintos para cada mes** y traspaso del sobrante al mes siguiente.
- Historial de aportaciones de cada objetivo (gráfica de su evolución) y enlazar aportaciones con movimientos.
- Importar movimientos desde un **CSV del banco**, con detección de duplicados.
- Varias **cuentas o carteras** (banco, efectivo, tarjeta) con traspasos.
- Posponer o descartar avisos concretos durante el mes.
- Etiquetas libres en los movimientos y búsqueda por etiqueta.
- Deshacer también al borrar objetivos, recurrentes, categorías y límites.
- Tests automáticos de las vistas en un navegador sin interfaz (los flujos completos se han probado así durante el desarrollo de la v1.1, pero no forman parte de `tests/`).
- Avisar si dos pestañas editan la misma colección a la vez, en lugar de quedarse con el último cambio.
- Sincronización opcional entre dispositivos (cifrada de extremo a extremo).
