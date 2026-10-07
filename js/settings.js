/**
 * settings.js
 * Vista de Configuración: perfil, tema, dinero disponible, categorías y gestión de datos
 * (exportar, importar con vista previa, copia previa a la actualización y borrar).
 */
const Settings = (() => {
  const { $, escapeHTML, formatBytes, formatMoney, formatDate } = Utils;

  const HORIZONS = [
    { value: 'month', label: 'Hasta final de mes' },
    { value: '7', label: 'Próximos 7 días' },
    { value: '30', label: 'Próximos 30 días' },
    { value: 'off', label: 'No descontar (mostrar solo el saldo)' },
  ];

  /* ---------------------------------------------------------------
   * EXPORTAR
   * ------------------------------------------------------------- */

  /** Descarga una copia completa (.json) con todos los datos y los recibos */
  async function exportData({ name = 'copia', silent = false } = {}) {
    const backup = Store.exportData();
    let receipts = [];
    try {
      receipts = await Receipts.exportAll();
    } catch (error) {
      console.warn('No se pudieron leer los recibos', error);
    }
    backup.data.receipts = receipts;
    Utils.downloadFile(`mybudget-${name}-${Utils.todayISO()}.json`, JSON.stringify(backup, null, 2));
    if (!silent) {
      UI.toast(receipts.length
        ? `Copia de seguridad descargada (incluye ${receipts.length} recibo${receipts.length === 1 ? '' : 's'})`
        : 'Copia de seguridad descargada');
    }
  }

  function downloadMigrationBackup() {
    const backup = Store.getMigrationBackup();
    if (!backup) return;
    Utils.downloadFile(`mybudget-copia-previa-v${backup.schemaVersion}-${Utils.todayISO()}.json`, JSON.stringify(backup, null, 2));
    UI.toast('Copia previa a la actualización descargada');
  }

  async function deleteMigrationBackup() {
    const ok = await UI.confirm({
      title: 'Eliminar la copia previa',
      message: 'Se borrará la copia de tus datos anterior a la actualización a MyBudget 1.1. Tus datos actuales no se modifican.',
      confirmText: 'Eliminar copia',
    });
    if (!ok) return;
    Store.clearMigrationBackup();
    UI.toast('Copia previa eliminada', 'info');
    App.render();
  }

  /* ---------------------------------------------------------------
   * IMPORTAR (con vista previa y confirmación)
   * ------------------------------------------------------------- */

  const MAX_IMPORT_BYTES = 60 * 1024 * 1024;
  let pendingImport = null; // { inspection, fileName } mientras se muestra la vista previa

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsText(file);
    });
  }

  /** Lee y valida el archivo SIN modificar nada; si es correcto muestra la vista previa */
  async function importData(file, button) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      UI.toast('Selecciona un archivo con extensión .json', 'error');
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      UI.toast(`El archivo es demasiado grande (${formatBytes(file.size)}).`, 'error');
      return;
    }
    UI.setLoading(button, true, 'Analizando…');
    try {
      const text = await readFile(file);
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('El archivo no contiene un JSON válido.');
      }
      pendingImport = { inspection: Store.inspectBackup(json), fileName: file.name };
      openImportPreview();
    } catch (error) {
      UI.toast(error.message || 'No se pudo leer el archivo', 'error', 6000);
    } finally {
      UI.setLoading(button, false);
    }
  }

  function openImportPreview() {
    const { inspection, fileName } = pendingImport;
    const s = inspection.summary;
    const discarded = (item) => (item.total > item.valid
      ? ` <small class="text-warn">(${item.total - item.valid} no válido${item.total - item.valid === 1 ? '' : 's'}: se descartará${item.total - item.valid === 1 ? '' : 'n'})</small>`
      : '');
    const row = (label, value) => `<li><span>${label}</span><strong>${value}</strong></li>`;
    const info = [escapeHTML(fileName)];
    if (inspection.exportedAt && Utils.isValidISODate(inspection.exportedAt.slice(0, 10))) info.push(`exportado el ${formatDate(inspection.exportedAt.slice(0, 10))}`);
    if (inspection.appVersion) info.push(`MyBudget ${escapeHTML(inspection.appVersion)}`);
    info.push(`formato de datos v${inspection.version}${inspection.version < Store.SCHEMA_VERSION ? ' (se actualizará al importar)' : ''}`);

    $('#import-file').innerHTML = info.join(' · ');
    $('#import-summary').innerHTML = [
      row('Movimientos', `${s.transactions.valid}${discarded(s.transactions)}`),
      row('Gastos recurrentes', `${s.recurring.valid}${discarded(s.recurring)}`),
      row('Objetivos de ahorro', `${s.goals.valid}${discarded(s.goals)}`),
      row('Categorías personalizadas', s.customCategories),
      row('Presupuesto mensual', s.monthlyBudget ? formatMoney(s.monthlyBudget) : 'Sin definir'),
      row('Límites por categoría', s.categoryLimits),
      row('Recibos', `${s.receipts.valid}${discarded(s.receipts)}`),
    ].join('');
    const current = Transactions.all().length;
    $('#import-current').textContent = `Se reemplazarán TODOS tus datos actuales (${current} movimiento${current === 1 ? '' : 's'}, ${Recurring.all().length} recurrente(s), ${Goals.all().length} objetivo(s) y sus recibos). Esta acción no se puede deshacer.`;
    $('#import-backup').checked = current > 0;
    UI.openModal('import-modal');
  }

  async function confirmImport() {
    if (!pendingImport) return;
    const { inspection } = pendingImport;
    const button = $('#import-confirm');
    UI.setLoading(button, true, 'Importando…');
    try {
      if ($('#import-backup').checked) await exportData({ name: 'antes-de-importar', silent: true });
      // Atómico: si no cabe todo, lanza un Error y no se modifica nada
      const result = Store.applyImport(inspection);
      let receiptsFailed = false;
      try {
        await Receipts.replaceAll(inspection.receipts);
      } catch (error) {
        console.error(error);
        receiptsFailed = true;
      }
      App.applyTheme(Store.getTheme() || 'light');
      UI.closeModal('import-modal');
      pendingImport = null;
      const message = `Datos importados: ${result.transactions} movimientos${result.discarded ? ` (${result.discarded} descartados por no ser válidos)` : ''}.`;
      UI.toast(receiptsFailed ? `${message} No se han podido guardar los recibos: el almacenamiento está lleno.` : message,
        receiptsFailed ? 'warning' : 'success', 6000);
    } catch (error) {
      UI.toast(error.message || 'No se pudo importar el archivo', 'error', 6000);
    } finally {
      UI.setLoading(button, false);
    }
  }

  /* ---------------------------------------------------------------
   * BORRAR / DATOS DE EJEMPLO
   * ------------------------------------------------------------- */

  async function clearAll() {
    const ok = await UI.confirm({
      title: 'Borrar todos los datos',
      message: 'Se eliminarán todos los movimientos, recibos, presupuestos, recurrentes, objetivos y categorías personalizadas. Esta acción NO se puede deshacer. Te recomendamos exportar una copia antes.',
      confirmText: 'Sí, borrar todo',
    });
    if (!ok) return;
    Store.clearAll();
    Receipts.clear().catch((error) => console.error(error));
    UI.toast('Todos los datos han sido eliminados', 'info');
  }

  async function loadDemo() {
    const hasData = Transactions.all().length > 0;
    if (hasData) {
      const ok = await UI.confirm({
        title: 'Cargar datos de ejemplo',
        message: 'Se añadirán movimientos, recurrentes y objetivos de ejemplo junto a tus datos actuales. Podrás borrarlos después.',
        confirmText: 'Cargar ejemplos',
        danger: false,
      });
      if (!ok) return;
    }
    Demo.load();
    UI.toast('Datos de ejemplo cargados');
  }

  async function clearDemo() {
    const ok = await UI.confirm({
      title: 'Borrar datos de ejemplo',
      message: 'Se eliminarán solo los datos de ejemplo. Los movimientos que hayas añadido o editado tú se conservarán.',
      confirmText: 'Borrar ejemplos',
    });
    if (!ok) return;
    Demo.clear();
    UI.toast('Datos de ejemplo eliminados', 'info');
  }

  /* ---------------------------------------------------------------
   * VISTA
   * ------------------------------------------------------------- */

  /** Rellena el espacio de los recibos cuando termina de leerlo (es asíncrono) */
  function fillReceiptStats() {
    Receipts.stats().then((stats) => {
      const count = $('#receipts-count');
      const size = $('#receipts-size');
      if (!count || !size) return;
      count.textContent = stats.count;
      size.textContent = stats.count ? formatBytes(stats.bytes) : '0 B';
      const where = $('#receipts-store');
      if (where) where.textContent = stats.store === 'indexeddb' ? 'IndexedDB' : 'LocalStorage';
    }).catch(() => {});
  }

  function render() {
    const view = $('#view-configuracion');
    const settings = Store.get('settings');
    const theme = document.documentElement.dataset.theme;
    const backup = Store.getMigrationBackup();
    const counts = {
      transactions: Transactions.all().length,
      categories: Categories.all().filter((c) => c.custom).length,
      recurring: Recurring.all().length,
      goals: Goals.all().length,
    };

    view.innerHTML = `
      <div class="grid grid-3">
        <section class="card">
          <h2 class="card-title">${Icons.get('user', 18)}Perfil</h2>
          <form id="profile-form" class="inline-form" novalidate>
            <div class="field">
              <label for="profile-name">Tu nombre <span class="muted">(para el saludo del dashboard)</span></label>
              <div class="input-group">
                <input type="text" id="profile-name" name="userName" maxlength="30" placeholder="Ej. Lucía" value="${escapeHTML(settings.userName)}">
                <button class="btn btn-primary" type="submit">Guardar</button>
              </div>
            </div>
          </form>
        </section>

        <section class="card">
          <h2 class="card-title">${Icons.get('palette', 18)}Apariencia</h2>
          <div class="theme-options" role="radiogroup" aria-label="Tema">
            <button class="theme-option ${theme === 'light' ? 'is-active' : ''}" data-action="set-theme" data-id="light" role="radio" aria-checked="${theme === 'light'}">
              <span class="theme-preview theme-preview-light"></span>${Icons.get('sun', 16)}Claro
            </button>
            <button class="theme-option ${theme === 'dark' ? 'is-active' : ''}" data-action="set-theme" data-id="dark" role="radio" aria-checked="${theme === 'dark'}">
              <span class="theme-preview theme-preview-dark"></span>${Icons.get('moon', 16)}Oscuro
            </button>
          </div>
        </section>

        <section class="card">
          <h2 class="card-title">${Icons.get('wallet', 18)}Dinero disponible</h2>
          <div class="field">
            <label for="available-horizon">Descontar del saldo los pagos recurrentes pendientes</label>
            <select id="available-horizon">
              ${HORIZONS.map((h) => `<option value="${h.value}" ${settings.availableHorizon === h.value ? 'selected' : ''}>${h.label}</option>`).join('')}
            </select>
          </div>
          <p class="hint">${Icons.get('info', 14)}<span>Es solo un cálculo para el dashboard y el informe: tu saldo real no cambia.</span></p>
        </section>
      </div>

      <section class="card">
        <div class="card-header">
          <h2 class="card-title">${Icons.get('tag', 18)}Categorías</h2>
          <button class="btn btn-primary btn-sm" data-action="add-category">${Icons.get('plus', 16)}Nueva categoría</button>
        </div>
        <div class="grid grid-2 grid-flat">
          <div>
            <h3 class="list-title">Gastos</h3>
            <ul class="category-list">${Categories.renderList('expense')}</ul>
          </div>
          <div>
            <h3 class="list-title">Ingresos</h3>
            <ul class="category-list">${Categories.renderList('income')}</ul>
          </div>
        </div>
        <p class="hint">${Icons.get('info', 14)}<span>Las categorías predeterminadas se pueden editar pero no eliminar. Al eliminar una categoría con movimientos podrás elegir a cuál pasan.</span></p>
      </section>

      <section class="card">
        <h2 class="card-title">${Icons.get('database', 18)}Tus datos</h2>
        <p class="muted">Todo se guarda en este navegador (LocalStorage y, para los recibos, IndexedDB). Nada sale de tu dispositivo.</p>
        <ul class="data-counts">
          <li><strong>${counts.transactions}</strong><span>movimientos</span></li>
          <li><strong>${counts.recurring}</strong><span>recurrentes</span></li>
          <li><strong>${counts.goals}</strong><span>objetivos</span></li>
          <li><strong>${counts.categories}</strong><span>categorías propias</span></li>
          <li><strong id="receipts-count">…</strong><span>recibos (<span id="receipts-size">…</span>)</span></li>
          <li><strong>${formatBytes(Store.usage())}</strong><span>datos en LocalStorage</span></li>
        </ul>

        <div class="data-actions">
          <div class="data-action">
            <div>
              <h3>Exportar datos</h3>
              <p class="muted">Descarga un archivo .json con toda tu información: movimientos, recibos, presupuestos, objetivos, recurrentes, categorías y preferencias.</p>
            </div>
            <button class="btn btn-ghost" data-action="export-data">${Icons.get('download', 18)}Exportar</button>
          </div>
          <div class="data-action">
            <div>
              <h3>Exportar movimientos a CSV</h3>
              <p class="muted">Abre tus movimientos en Excel, LibreOffice o Google Sheets.</p>
            </div>
            <button class="btn btn-ghost" data-action="export-csv-all">${Icons.get('download', 18)}Exportar CSV</button>
          </div>
          <div class="data-action">
            <div>
              <h3>Importar datos</h3>
              <p class="muted">Recupera una copia exportada anteriormente (.json). Antes de reemplazar nada verás qué contiene y podrás descargar una copia de tus datos actuales.</p>
            </div>
            <button class="btn btn-ghost" id="import-btn" type="button">${Icons.get('upload', 18)}Importar</button>
            <input type="file" id="import-input" accept=".json,application/json" hidden>
          </div>
          ${backup ? `
            <div class="data-action">
              <div>
                <h3>Copia previa a la actualización</h3>
                <p class="muted">Tus datos tal y como estaban antes de actualizar a MyBudget 1.1 (formato v${backup.schemaVersion}), guardados el ${formatDate(String(backup.exportedAt).slice(0, 10))}. Se puede importar si algo no fuera bien.</p>
              </div>
              <div class="data-action-buttons">
                <button class="btn btn-ghost" data-action="download-migration-backup">${Icons.get('shield', 18)}Descargar</button>
                <button class="btn btn-link btn-sm" data-action="delete-migration-backup">Eliminar</button>
              </div>
            </div>` : ''}
          <div class="data-action">
            <div>
              <h3>Datos de ejemplo</h3>
              <p class="muted">${Demo.hasDemoData() ? 'Hay datos de ejemplo cargados.' : 'Carga datos ficticios para probar la aplicación.'}</p>
            </div>
            ${Demo.hasDemoData()
              ? `<button class="btn btn-ghost" data-action="clear-demo">${Icons.get('trash', 18)}Borrar ejemplos</button>`
              : `<button class="btn btn-ghost" data-action="load-demo">${Icons.get('sparkles', 18)}Cargar ejemplos</button>`}
          </div>
        </div>

        <div class="danger-zone">
          <div>
            <h3>Borrar todos los datos</h3>
            <p class="muted">Elimina permanentemente toda la información guardada, también los recibos.</p>
          </div>
          <button class="btn btn-danger" data-action="clear-all">${Icons.get('trash', 18)}Borrar todo</button>
        </div>
        <p class="app-version">MyBudget v${Store.APP_VERSION.replace(/\.0$/, '')} · formato de datos v${Store.SCHEMA_VERSION} · recibos en <span id="receipts-store">…</span></p>
      </section>

      <section class="card shortcuts-card">
        <div class="card-header">
          <h2 class="card-title">${Icons.get('keyboard', 18)}Atajos de teclado</h2>
          <button class="btn btn-ghost btn-sm" data-action="show-shortcuts">Ver todos</button>
        </div>
        <p class="muted">Pulsa <kbd>N</kbd> para un nuevo gasto, <kbd>I</kbd> para un ingreso, <kbd>/</kbd> para buscar y <kbd>?</kbd> para ver la lista completa.</p>
      </section>`;

    $('#profile-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const userName = event.target.elements.userName.value.trim();
      Store.set('settings', { ...Store.get('settings'), userName });
      UI.toast(userName ? `¡Hola, ${userName}! Nombre guardado` : 'Nombre eliminado');
    });

    $('#available-horizon').addEventListener('change', (event) => {
      const value = event.target.value;
      if (!Store.AVAILABLE_HORIZONS.includes(value)) return;
      Store.set('settings', { ...Store.get('settings'), availableHorizon: value });
      UI.toast(value === 'off' ? 'El dashboard mostrará solo el saldo' : 'Preferencia de dinero disponible guardada');
    });

    const input = $('#import-input');
    const button = $('#import-btn');
    button.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      importData(input.files[0], button);
      input.value = ''; // permite volver a importar el mismo archivo
    });

    fillReceiptStats();
  }

  function init() {
    $('#import-confirm').addEventListener('click', confirmImport);
    $('#import-modal').addEventListener('close', () => { pendingImport = null; });
  }

  const actions = {
    'export-data': () => exportData(),
    'clear-all': clearAll,
    'load-demo': loadDemo,
    'clear-demo': clearDemo,
    'download-migration-backup': downloadMigrationBackup,
    'delete-migration-backup': deleteMigrationBackup,
    'add-category': () => Categories.openForm(),
    'edit-category': (id) => Categories.openForm(id),
    'delete-category': (id) => Categories.remove(id),
    'hide-demo-banner': () => Store.set('settings', { ...Store.get('settings'), demoBannerHidden: true }),
  };

  return { render, init, actions, exportData };
})();
