/**
 * app.js
 * Punto de entrada: inicialización, navegación SPA (por hash), selector de mes,
 * tema claro/oscuro, menú móvil, buscador global, atajos de teclado y acciones globales.
 */
const App = (() => {
  const { $, $$, escapeHTML, formatMoney, formatDate, normalize, monthLabel } = Utils;

  // Cada vista: título, subtítulo, si usa el selector de mes y su función de pintado
  const VIEWS = {
    dashboard: { title: 'Dashboard', subtitle: (m) => `Resumen de ${monthLabel(m)}`, month: true, render: (m) => Dashboard.render(m) },
    movimientos: { title: 'Movimientos', subtitle: () => 'Historial de ingresos y gastos', month: false, render: () => Transactions.render() },
    estadisticas: { title: 'Estadísticas', subtitle: (m) => `Análisis de ${monthLabel(m)}`, month: true, render: (m) => StatsView.render(m) },
    presupuestos: { title: 'Presupuestos', subtitle: (m) => `Control de gasto de ${monthLabel(m)}`, month: true, render: (m) => Budget.render(m) },
    objetivos: { title: 'Objetivos', subtitle: () => 'Tus metas de ahorro', month: false, render: () => Goals.render() },
    recurrentes: { title: 'Recurrentes', subtitle: () => 'Suscripciones y pagos periódicos', month: true, render: (m) => Recurring.render(m) },
    configuracion: { title: 'Configuración', subtitle: () => 'Preferencias y gestión de datos', month: false, render: () => Settings.render() },
  };
  const VIEW_ORDER = Object.keys(VIEWS);

  // Secciones con pestaña propia en la barra inferior (móvil); el resto se marca en "Más"
  const TAB_VIEWS = ['dashboard', 'movimientos', 'estadisticas'];

  // Punto de corte de móvil (el mismo que en responsive.css)
  const mobileQuery = window.matchMedia('(max-width: 768px)');

  const state = {
    view: 'dashboard',
    month: Utils.currentMonthKey(),
  };

  /* ---------------------------------------------------------------
   * RENDERIZADO Y NAVEGACIÓN
   * ------------------------------------------------------------- */

  function render() {
    const view = VIEWS[state.view];
    $('#view-subtitle').textContent = view.subtitle(state.month);
    try {
      view.render(state.month);
      renderSidebarSummary();
    } catch (error) {
      console.error(error);
      UI.toast('Se ha producido un error al mostrar esta sección', 'error');
    }
  }

  /** Agrupa varios cambios de datos seguidos en un único repintado (en el siguiente frame) */
  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  /** Mini resumen del mes seleccionado en la barra lateral (visible en todas las secciones) */
  function renderSidebarSummary() {
    const box = $('#sidebar-summary');
    const summary = Stats.monthSummary(state.month);
    const budget = Budget.monthlyStatus(state.month);
    const month = monthLabel(state.month).split(' ')[0].toLowerCase();
    let detail = `<small>Ingresos: ${formatMoney(summary.income)}</small>`;
    if (budget.limit) {
      detail = `
        ${UI.progressBar(budget.pct, budget.level, 'Presupuesto mensual utilizado')}
        <small>${budget.available >= 0
          ? `Quedan ${formatMoney(budget.available)} de ${formatMoney(budget.limit)}`
          : `${formatMoney(-budget.available)} por encima del presupuesto`}</small>`;
    }
    box.innerHTML = `
      <span class="sidebar-summary-label">Gastado en ${month}</span>
      <strong class="sidebar-summary-value">${UI.money(summary.expense)}</strong>
      ${detail}`;
  }

  let enteringTimer = null;

  function navigate(name) {
    if (!VIEWS[name]) name = 'dashboard';
    const changed = state.view !== name;
    state.view = name;

    $$('.view').forEach((el) => el.classList.toggle('is-active', el.id === `view-${name}`));
    // Las animaciones de entrada solo se reproducen al llegar a una sección,
    // no cada vez que la vista se vuelve a pintar porque han cambiado los datos
    const viewEl = $(`#view-${name}`);
    $$('.view.is-entering').forEach((el) => el.classList.remove('is-entering'));
    viewEl.classList.add('is-entering');
    clearTimeout(enteringTimer);
    enteringTimer = setTimeout(() => viewEl.classList.remove('is-entering'), 900);
    $$('.nav-link, .tab-link[data-view]').forEach((link) => {
      const active = link.dataset.view === name;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    $('#tab-more').classList.toggle('is-active', !TAB_VIEWS.includes(name));
    $('#view-title').textContent = VIEWS[name].title;
    $('#month-picker').classList.toggle('is-hidden', !VIEWS[name].month);
    document.title = `${VIEWS[name].title} · MyBudget`;

    if (location.hash !== `#/${name}`) history.replaceState(null, '', `#/${name}`);
    closeSidebar();
    render();
    if (changed) $('#content').scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  }

  function routeFromHash() {
    navigate(location.hash.replace(/^#\/?/, '') || 'dashboard');
  }

  /* ---------------------------------------------------------------
   * SELECTOR DE MES
   * ------------------------------------------------------------- */

  function setMonth(key) {
    state.month = key;
    updateMonthLabel();
    render();
  }

  function updateMonthLabel() {
    const isCurrent = state.month === Utils.currentMonthKey();
    const label = $('#month-label');
    // En móvil se muestra la versión corta ("Oct 2026") para que quepa junto al título
    label.innerHTML = `${Icons.get('calendar', 16)}<span class="month-long">${monthLabel(state.month)}</span>`
      + `<span class="month-short">${monthLabel(state.month, true)} ${state.month.slice(0, 4)}</span>`
      + `${isCurrent ? '' : '<small>Volver a hoy</small>'}`;
    label.classList.toggle('is-current', isCurrent);
  }

  function initMonthPicker() {
    $('#month-prev').addEventListener('click', () => setMonth(Utils.addMonths(state.month, -1)));
    $('#month-next').addEventListener('click', () => setMonth(Utils.addMonths(state.month, 1)));
    $('#month-label').addEventListener('click', () => setMonth(Utils.currentMonthKey()));
    updateMonthLabel();
  }

  /* ---------------------------------------------------------------
   * TEMA
   * ------------------------------------------------------------- */

  function applyTheme(theme, { save = true } = {}) {
    document.documentElement.dataset.theme = theme;
    if (save) Store.setTheme(theme);
    const toggle = $('#theme-toggle');
    const icon = toggle.querySelector('.theme-icon');
    icon.dataset.icon = theme === 'dark' ? 'sun' : 'moon';
    Icons.hydrate(toggle);
    toggle.querySelector('.theme-label').textContent = theme === 'dark' ? 'Modo claro' : 'Modo oscuro';
    $('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#101219' : '#5b5bd6');
  }

  function toggleTheme() {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    render(); // las gráficas leen los colores del tema
  }

  /* ---------------------------------------------------------------
   * MENÚ LATERAL (móvil)
   * ------------------------------------------------------------- */

  function openSidebar() {
    document.body.classList.add('sidebar-open');
    $('#menu-toggle').setAttribute('aria-expanded', 'true');
    $('#tab-more').setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    $('#menu-toggle').setAttribute('aria-expanded', 'false');
    $('#tab-more').setAttribute('aria-expanded', 'false');
  }

  /* ---------------------------------------------------------------
   * BUSCADOR GLOBAL
   * ------------------------------------------------------------- */

  function searchResults(query) {
    const q = normalize(query.trim());
    if (!q) return [];
    const results = [];

    VIEW_ORDER.filter((v) => normalize(VIEWS[v].title).includes(q)).forEach((v) => {
      results.push({ group: 'Secciones', icon: Icons.get('chevronRight', 16), title: VIEWS[v].title, meta: 'Ir a la sección', run: () => navigate(v) });
    });

    const txs = Transactions.applyFilters(Transactions.all(), { text: query, type: 'all', categoryId: '', from: '', to: '', method: '' })
      .sort((a, b) => b.date.localeCompare(a.date));
    txs.slice(0, 5).forEach((t) => {
      const category = Categories.get(t.categoryId);
      results.push({
        group: `Movimientos (${txs.length})`,
        icon: escapeHTML(category.icon),
        title: escapeHTML(t.concept),
        meta: `${formatDate(t.date)} · ${formatMoney(t.type === 'income' ? t.amount : -t.amount, { sign: true })}`,
        run: () => Transactions.openForm({ id: t.id }),
      });
    });
    if (txs.length > 5) {
      results.push({ group: `Movimientos (${txs.length})`, icon: Icons.get('search', 16), title: `Ver los ${txs.length} resultados`, meta: 'En Movimientos', run: () => searchInTransactions(query) });
    }

    Goals.all().filter((g) => normalize(g.name).includes(q)).slice(0, 3).forEach((g) => {
      results.push({ group: 'Objetivos', icon: escapeHTML(g.icon), title: escapeHTML(g.name), meta: `${formatMoney(g.saved)} de ${formatMoney(g.target)}`, run: () => navigate('objetivos') });
    });

    Recurring.all().filter((r) => normalize(r.name).includes(q)).slice(0, 3).forEach((r) => {
      results.push({ group: 'Recurrentes', icon: escapeHTML(Categories.get(r.categoryId).icon), title: escapeHTML(r.name), meta: formatMoney(r.amount), run: () => navigate('recurrentes') });
    });

    return results;
  }

  let currentResults = [];

  function renderSearch() {
    const input = $('#global-search-input');
    const box = $('#global-search-results');
    const query = input.value;
    if (!query.trim()) {
      box.hidden = true;
      return;
    }
    currentResults = searchResults(query);
    let lastGroup = '';
    box.innerHTML = currentResults.length
      ? currentResults.map((r, i) => {
        const header = r.group !== lastGroup ? `<p class="search-group">${r.group}</p>` : '';
        lastGroup = r.group;
        return `${header}<button class="search-result" data-index="${i}" role="option">
          <span class="search-result-icon">${r.icon}</span>
          <span class="grow"><strong>${r.title}</strong><small class="muted">${r.meta}</small></span>
        </button>`;
      }).join('')
      : `<p class="search-empty">Sin resultados para "${escapeHTML(query)}"</p>`;
    box.hidden = false;
  }

  function closeSearch(clear = false) {
    $('#global-search-results').hidden = true;
    if (clear) {
      $('#global-search-input').value = '';
      setMobileSearch(false);
    }
  }

  /** En móvil el buscador está plegado y se despliega con su botón */
  function setMobileSearch(open) {
    $('.topbar').classList.toggle('search-open', open);
    $('#search-toggle').setAttribute('aria-expanded', String(open));
    if (open) $('#global-search-input').focus();
  }

  function searchInTransactions(query) {
    Transactions.setSearch(query);
    closeSearch(true);
    navigate('movimientos');
  }

  function initSearch() {
    const input = $('#global-search-input');
    const box = $('#global-search-results');
    input.addEventListener('input', Utils.debounce(renderSearch, 150));
    input.addEventListener('focus', renderSearch);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && input.value.trim()) {
        event.preventDefault();
        searchInTransactions(input.value.trim());
      } else if (event.key === 'Escape') {
        closeSearch(true);
        input.blur();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        box.querySelector('.search-result')?.focus();
      }
    });
    box.addEventListener('click', (event) => {
      const button = event.target.closest('.search-result');
      if (!button) return;
      const result = currentResults[Number(button.dataset.index)];
      closeSearch(true);
      result.run();
    });
    // Navegación con flechas dentro de los resultados
    box.addEventListener('keydown', (event) => {
      const items = $$('.search-result', box);
      const index = items.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') { event.preventDefault(); items[Math.min(index + 1, items.length - 1)]?.focus(); }
      if (event.key === 'ArrowUp') { event.preventDefault(); index <= 0 ? input.focus() : items[index - 1].focus(); }
      if (event.key === 'Escape') { closeSearch(true); input.focus(); }
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('#global-search')) closeSearch();
    });
  }

  /* ---------------------------------------------------------------
   * ACCIONES GLOBALES (delegación de eventos con data-action)
   * ------------------------------------------------------------- */

  const actions = {
    ...Transactions.actions,
    ...Budget.actions,
    ...Recurring.actions,
    ...Goals.actions,
    ...Settings.actions,
    'select-month': (key) => setMonth(key),
    'set-theme': (theme) => { applyTheme(theme); render(); },
    'show-shortcuts': () => UI.openModal('shortcuts-modal'),
  };

  function initActions() {
    document.addEventListener('click', (event) => {
      const el = event.target.closest('[data-action]');
      if (!el || !actions[el.dataset.action]) return;
      event.preventDefault();
      actions[el.dataset.action](el.dataset.id, el);
    });
  }

  /* ---------------------------------------------------------------
   * ATAJOS DE TECLADO
   * ------------------------------------------------------------- */

  function initShortcuts() {
    document.addEventListener('keydown', (event) => {
      const target = event.target;
      const typing = target.matches('input, textarea, select, [contenteditable="true"]');

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setMobileSearch(true);
        return;
      }
      if (typing || UI.isAnyModalOpen() || event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key;
      if (key === '/') { event.preventDefault(); setMobileSearch(true); return; }
      if (key === '?') { UI.openModal('shortcuts-modal'); return; }
      if (key === 'Escape') { closeSidebar(); return; }

      const lower = key.toLowerCase();
      if (lower === 'n') { event.preventDefault(); Transactions.openForm({ type: 'expense' }); return; }
      if (lower === 'i') { event.preventDefault(); Transactions.openForm({ type: 'income' }); return; }
      if (lower === 't') { toggleTheme(); return; }
      if (/^[1-7]$/.test(key)) { navigate(VIEW_ORDER[Number(key) - 1]); return; }
      if (VIEWS[state.view].month && key === 'ArrowLeft') setMonth(Utils.addMonths(state.month, -1));
      if (VIEWS[state.view].month && key === 'ArrowRight') setMonth(Utils.addMonths(state.month, 1));
    });
  }

  /* ---------------------------------------------------------------
   * INICIO
   * ------------------------------------------------------------- */

  function storageAvailable() {
    try {
      localStorage.setItem('gestorGastos.__test', '1');
      localStorage.removeItem('gestorGastos.__test');
      return true;
    } catch {
      return false;
    }
  }

  function init() {
    const { isFirstRun } = Store.init();
    if (isFirstRun) Demo.load();

    Charts.init();
    Icons.hydrate();
    UI.initModals();
    Categories.init();
    Transactions.init();
    Budget.init();
    Recurring.init();
    Goals.init();

    applyTheme(document.documentElement.dataset.theme || 'light');
    initMonthPicker();
    initSearch();
    initActions();
    initShortcuts();

    // Cualquier cambio en los datos (también desde otra pestaña) vuelve a pintar la vista actual
    Store.subscribe((key) => {
      if (key === 'theme') {
        const theme = Store.getTheme();
        if (theme === 'light' || theme === 'dark') applyTheme(theme, { save: false });
      }
      scheduleRender();
    });

    $('#menu-toggle').addEventListener('click', openSidebar);
    $('#search-toggle').addEventListener('click', () => setMobileSearch(!$('.topbar').classList.contains('search-open')));
    $('#sidebar-close').addEventListener('click', closeSidebar);
    $('#sidebar-overlay').addEventListener('click', closeSidebar);
    $('#theme-toggle').addEventListener('click', toggleTheme);
    $('#shortcuts-btn').addEventListener('click', () => UI.openModal('shortcuts-modal'));
    $('#topbar-add').addEventListener('click', () => Transactions.openForm({ type: 'expense' }));
    $('#tab-add').addEventListener('click', () => Transactions.openForm({ type: 'expense' }));
    $('#tab-more').addEventListener('click', () => (document.body.classList.contains('sidebar-open') ? closeSidebar() : openSidebar()));
    window.addEventListener('hashchange', routeFromHash);
    // Al pasar de escritorio a móvil (o al revés) se repinta: las gráficas usan opciones distintas
    mobileQuery.addEventListener('change', render);

    routeFromHash();

    if (!storageAvailable()) {
      UI.toast('LocalStorage no está disponible: los cambios no se guardarán al cerrar el navegador.', 'warning', 8000);
    } else if (isFirstRun) {
      UI.toast('¡Bienvenido! Estos son datos de ejemplo', 'info', 4000);
    }

    // Ocultamos la pantalla de carga
    const loader = $('#app-loader');
    loader.classList.add('is-hidden');
    setTimeout(() => loader.remove(), 400);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { navigate, applyTheme, render };
})();
