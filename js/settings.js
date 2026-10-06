/**
 * settings.js
 * Vista de Configuración: perfil, tema, categorías y gestión de datos (exportar, importar, borrar).
 */
const Settings = (() => {
  const { $, escapeHTML } = Utils;

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  }

  /* ---------------------------------------------------------------
   * DATOS
   * ------------------------------------------------------------- */

  function exportData() {
    const json = JSON.stringify(Store.exportData(), null, 2);
    Utils.downloadFile(`mybudget-copia-${Utils.todayISO()}.json`, json);
    UI.toast('Copia de seguridad descargada');
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsText(file);
    });
  }

  async function importData(file, button) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      UI.toast('Selecciona un archivo con extensión .json', 'error');
      return;
    }
    UI.setLoading(button, true, 'Importando…');
    try {
      const text = await readFile(file);
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('El archivo no contiene un JSON válido.');
      }
      Store.validateBackup(json);
      UI.setLoading(button, false);
      const ok = await UI.confirm({
        title: 'Importar datos',
        message: 'Se reemplazarán TODOS tus datos actuales por los del archivo. ¿Quieres continuar?',
        confirmText: 'Importar',
        danger: false,
      });
      if (!ok) return;
      const result = Store.importData(json);
      App.applyTheme(Store.getTheme() || 'light');
      UI.toast(`Datos importados: ${result.transactions} movimientos${result.discarded ? ` (${result.discarded} descartados por no ser válidos)` : ''}`);
    } catch (error) {
      UI.toast(error.message || 'No se pudo importar el archivo', 'error', 5000);
    } finally {
      UI.setLoading(button, false);
    }
  }

  async function clearAll() {
    const ok = await UI.confirm({
      title: 'Borrar todos los datos',
      message: 'Se eliminarán todos los movimientos, presupuestos, recurrentes, objetivos y categorías personalizadas. Esta acción NO se puede deshacer. Te recomendamos exportar una copia antes.',
      confirmText: 'Sí, borrar todo',
    });
    if (!ok) return;
    Store.clearAll();
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

  function render() {
    const view = $('#view-configuracion');
    const settings = Store.get('settings');
    const theme = document.documentElement.dataset.theme;
    const counts = {
      transactions: Transactions.all().length,
      categories: Categories.all().filter((c) => c.custom).length,
      recurring: Recurring.all().length,
      goals: Goals.all().length,
    };

    view.innerHTML = `
      <div class="grid grid-2">
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
      </section>

      <section class="card">
        <h2 class="card-title">${Icons.get('database', 18)}Tus datos</h2>
        <p class="muted">Todo se guarda en el LocalStorage de este navegador. Nada sale de tu ordenador.</p>
        <ul class="data-counts">
          <li><strong>${counts.transactions}</strong><span>movimientos</span></li>
          <li><strong>${counts.recurring}</strong><span>recurrentes</span></li>
          <li><strong>${counts.goals}</strong><span>objetivos</span></li>
          <li><strong>${counts.categories}</strong><span>categorías propias</span></li>
          <li><strong>${formatBytes(Store.usage())}</strong><span>ocupado</span></li>
        </ul>

        <div class="data-actions">
          <div class="data-action">
            <div>
              <h3>Exportar datos</h3>
              <p class="muted">Descarga un archivo .json con toda tu información.</p>
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
              <p class="muted">Recupera una copia exportada anteriormente (.json).</p>
            </div>
            <button class="btn btn-ghost" id="import-btn" type="button">${Icons.get('upload', 18)}Importar</button>
            <input type="file" id="import-input" accept=".json,application/json" hidden>
          </div>
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
            <p class="muted">Elimina permanentemente toda la información guardada.</p>
          </div>
          <button class="btn btn-danger" data-action="clear-all">${Icons.get('trash', 18)}Borrar todo</button>
        </div>
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

    const input = $('#import-input');
    const button = $('#import-btn');
    button.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      importData(input.files[0], button);
      input.value = ''; // permite volver a importar el mismo archivo
    });
  }

  const actions = {
    'export-data': exportData,
    'clear-all': clearAll,
    'load-demo': loadDemo,
    'clear-demo': clearDemo,
    'add-category': () => Categories.openForm(),
    'edit-category': (id) => Categories.openForm(id),
    'delete-category': (id) => Categories.remove(id),
    'hide-demo-banner': () => Store.set('settings', { ...Store.get('settings'), demoBannerHidden: true }),
  };

  return { render, actions };
})();
