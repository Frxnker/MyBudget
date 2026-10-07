/**
 * budget.js
 * Presupuesto mensual general y límites por categoría.
 * Store "budgets" = { monthly: céntimos, byCategory: { [categoryId]: céntimos } }
 */
const Budget = (() => {
  const { $, escapeHTML, formatMoney, formatPercent, percent } = Utils;

  function data() {
    return Store.get('budgets');
  }

  function setMonthly(cents) {
    Store.set('budgets', { ...data(), monthly: cents });
  }

  function setCategory(categoryId, cents) {
    const budgets = data();
    Store.set('budgets', { ...budgets, byCategory: { ...budgets.byCategory, [categoryId]: cents } });
  }

  async function removeCategory(categoryId) {
    const category = Categories.get(categoryId);
    const ok = await UI.confirm({
      title: 'Eliminar límite',
      message: `Se eliminará el límite mensual de "${category.name}". Los movimientos no se verán afectados.`,
    });
    if (!ok) return;
    const byCategory = { ...data().byCategory };
    delete byCategory[categoryId];
    Store.set('budgets', { ...data(), byCategory });
    UI.toast(`Límite de ${category.name} eliminado`, 'info');
  }

  /* ---------------------------------------------------------------
   * CÁLCULOS
   * ------------------------------------------------------------- */

  /** Estado del presupuesto general en un mes */
  function monthlyStatus(key) {
    const limit = data().monthly;
    const spent = Stats.monthSummary(key).expense;
    const pct = percent(spent, limit);
    return { limit, spent, available: limit - spent, pct, level: UI.budgetLevel(pct) };
  }

  /**
   * Ritmo ideal de gasto: qué parte del límite "tocaría" llevar gastada a día de hoy
   * si se gastara lo mismo cada día. Solo tiene sentido en el mes actual.
   */
  function idealPace(key, limit) {
    if (!limit || key !== Utils.currentMonthKey()) return null;
    const pct = (new Date().getDate() / Utils.daysInMonth(key)) * 100;
    return { pct, amount: Math.round((limit * pct) / 100) };
  }

  /**
   * Presupuesto inteligente del mes en curso (ver Finance.budgetPlan): restante, días que quedan,
   * gasto recomendado por día, ritmo y previsión de fin de mes.
   * Devuelve null si no hay presupuesto mensual o si "key" no es el mes actual.
   */
  function plan(key) {
    const limit = data().monthly;
    if (!limit || key !== Utils.currentMonthKey()) return null;
    const recurring = Recurring.monthBreakdown(key);
    return Finance.budgetPlan({
      limit,
      spent: Stats.monthSummary(key).expense,
      daysInMonth: Utils.daysInMonth(key),
      day: new Date().getDate(),
      fixedSpent: recurring.fixedSpent,
      pendingFixed: recurring.pendingFixed,
    });
  }

  /** Frase de estado del presupuesto inteligente (con icono y texto, no solo color) */
  function planNote(p) {
    const projection = `Al ritmo actual terminarás el mes gastando aproximadamente <strong>${formatMoney(p.projected)}</strong>`;
    if (p.status === 'over') {
      return UI.statusNote('over', `Has superado el presupuesto en <strong>${formatMoney(-p.remaining)}</strong>. ${projection}.`);
    }
    if (p.status === 'fast') {
      return UI.statusNote('warn', `<strong>Estás gastando más rápido de lo recomendado.</strong> ${projection} (${formatMoney(p.projected - p.limit)} por encima del presupuesto).`);
    }
    return UI.statusNote('ok', `<strong>Tu gasto está dentro del presupuesto previsto.</strong> ${projection}.`);
  }

  /** Cifras del presupuesto inteligente: días restantes, gasto recomendado, media y previsión */
  function planFiguresHTML(p) {
    return `
      <dl class="plan-grid">
        <div><dt>Días restantes</dt><dd>${p.daysLeft}</dd></div>
        <div><dt>Gasto recomendado</dt><dd>${formatMoney(p.recommendedDaily)}<small>/día</small></dd></div>
        <div><dt>Tu media diaria</dt><dd>${formatMoney(p.avgDaily)}<small>/día</small></dd></div>
        <div><dt>Previsión fin de mes</dt><dd class="${p.projected > p.limit ? 'amount-negative' : ''}">${formatMoney(p.projected)}</dd></div>
      </dl>`;
  }

  /** Estado de cada límite por categoría en un mes */
  function categoryStatuses(key) {
    return Object.entries(data().byCategory)
      .filter(([id]) => Categories.exists(id, 'expense'))
      .map(([id, limit]) => {
        const spent = Stats.categorySpent(key, id);
        const pct = percent(spent, limit);
        return { category: Categories.get(id), categoryId: id, limit, spent, available: limit - spent, pct, level: UI.budgetLevel(pct) };
      })
      .sort((a, b) => b.pct - a.pct);
  }

  /* ---------------------------------------------------------------
   * FORMULARIOS
   * ------------------------------------------------------------- */

  let editingCategory = null;

  function openCategoryForm(categoryId = null) {
    const form = $('#budget-form');
    form.reset();
    editingCategory = categoryId;
    const used = Object.keys(data().byCategory);
    const options = Categories.byType('expense')
      .filter((c) => c.id === categoryId || !used.includes(c.id))
      .map((c) => ({ value: c.id, label: `${c.icon}  ${c.name}` }));

    if (!options.length) {
      UI.toast('Todas las categorías de gasto ya tienen un límite', 'info');
      return;
    }
    UI.fillSelect(form.elements.categoryId, options, { placeholder: 'Selecciona una categoría', selected: categoryId || '' });
    form.elements.categoryId.disabled = Boolean(categoryId);
    form.elements.amount.value = categoryId ? Utils.centsToInput(data().byCategory[categoryId]) : '';
    $('#budget-modal-title').textContent = categoryId ? 'Editar límite' : 'Nuevo límite por categoría';
    UI.openModal('budget-modal');
  }

  function handleCategorySubmit(event) {
    event.preventDefault();
    const form = event.target;
    const categoryId = form.elements.categoryId.value;
    const errors = {};
    if (!categoryId) errors.categoryId = 'Selecciona una categoría.';
    const amount = UI.validateAmount(form.elements.amount.value, { label: 'El límite' });
    if (amount.error) errors.amount = amount.error;
    if (!UI.showErrors(form, errors)) return;

    setCategory(categoryId, amount.cents);
    UI.closeModal('budget-modal');
    UI.toast(`Límite de ${Categories.get(categoryId).name} guardado`);
  }

  function handleMonthlySubmit(event) {
    event.preventDefault();
    const form = event.target;
    const amount = UI.validateAmount(form.elements.monthly.value, { label: 'El presupuesto' });
    if (!UI.showErrors(form, amount.error ? { monthly: amount.error } : {})) return;
    setMonthly(amount.cents);
    UI.toast('Presupuesto mensual guardado');
  }

  async function removeMonthly() {
    const ok = await UI.confirm({
      title: 'Quitar presupuesto mensual',
      message: 'Dejarás de ver el seguimiento del presupuesto general. Los límites por categoría se mantienen.',
      confirmText: 'Quitar',
    });
    if (!ok) return;
    setMonthly(0);
    UI.toast('Presupuesto mensual eliminado', 'info');
  }

  /* ---------------------------------------------------------------
   * VISTA
   * ------------------------------------------------------------- */

  const STATUS = {
    ok: { label: 'En control', text: 'Vas bien, sigue así.', icon: 'check' },
    warn: { label: 'Cerca del límite', text: 'Cuidado: te queda poco margen.', icon: 'alert' },
    over: { label: 'Superado', text: 'Has superado el presupuesto.', icon: 'alert' },
  };

  /** Etiqueta de estado de un presupuesto (verde, ámbar o rojo, siempre con icono y texto) */
  function statusPill(level, label = STATUS[level].label) {
    return `<span class="status-pill status-${level}">${Icons.get(STATUS[level].icon, 14)}${label}</span>`;
  }

  function monthlyCardHTML(key) {
    const s = monthlyStatus(key);
    const pace = idealPace(key, s.limit);
    const p = plan(key);

    // La marca es informativa: los gastos fijos (alquiler, recibos) suelen concentrarse a principio de mes
    const paceText = pace
      ? `<p class="hint">${Icons.get('clock', 14)}<span>La marca de la barra indica lo que llevarías gastado hoy repartiendo el presupuesto por igual cada día: <strong>${formatMoney(pace.amount)}</strong>.</span></p>`
      : '';
    const fixedText = p && p.pendingFixed
      ? `<p class="hint">${Icons.get('repeat', 14)}<span>Quedan <strong>${formatMoney(p.pendingFixed)}</strong> de pagos recurrentes este mes: ya están descontados del gasto recomendado y sumados a la previsión.</span></p>`
      : '';
    let monthNote = '';
    if (!p && key < Utils.currentMonthKey()) {
      monthNote = s.available >= 0
        ? UI.statusNote('ok', `Cerraste el mes <strong>${formatMoney(s.available)}</strong> por debajo del presupuesto.`)
        : UI.statusNote('over', `Cerraste el mes <strong>${formatMoney(-s.available)}</strong> por encima del presupuesto.`);
    } else if (!p && s.limit) {
      monthNote = UI.statusNote('info', `Este mes aún no ha empezado: podrás gastar unos <strong>${formatMoney(Math.round(s.limit / Utils.daysInMonth(key)))}</strong> al día.`);
    }

    const body = s.limit
      ? `
        <div class="budget-figures">
          <div><span>Gastado</span><strong>${UI.money(s.spent)}</strong></div>
          <div><span>Presupuesto</span><strong>${UI.money(s.limit)}</strong></div>
          <div><span>${s.available >= 0 ? 'Restante' : 'Exceso'}</span>
            <strong class="${s.available >= 0 ? 'amount-income' : 'amount-negative'}">${UI.money(Math.abs(s.available))}</strong></div>
        </div>
        ${UI.progressBar(s.pct, s.level, 'Presupuesto mensual utilizado', pace ? { marker: pace.pct, markerLabel: `Ritmo ideal hoy: ${formatMoney(pace.amount)}` } : {})}
        <p class="budget-status"><strong>${formatPercent(s.pct)}</strong> utilizado${p ? '' : ` · ${STATUS[s.level].text}`}</p>
        ${p ? `${planFiguresHTML(p)}${planNote(p)}` : monthNote}
        ${paceText}
        ${fixedText}`
      : '<p class="muted">Aún no has definido un presupuesto mensual. Establece una cantidad máxima de gasto para cada mes.</p>';

    return `
      <div class="card budget-main">
        <div class="card-header">
          <div>
            <h2 class="card-title">${Icons.get('pie', 18)}Presupuesto mensual</h2>
            <p class="card-subtitle">${Utils.monthLabel(key)}</p>
          </div>
          ${!s.limit ? '' : p && p.status === 'fast' && s.level === 'ok' ? statusPill('warn', 'Ritmo alto') : statusPill(s.level)}
        </div>
        ${body}
        <form class="inline-form" id="monthly-budget-form" novalidate>
          <div class="field">
            <label for="monthly-budget-input">${s.limit ? 'Cambiar presupuesto' : 'Presupuesto mensual'}</label>
            <div class="input-group">
              <div class="input-affix">
                <input type="text" id="monthly-budget-input" name="monthly" inputmode="decimal" autocomplete="off"
                  placeholder="Ej. 1000" value="${s.limit ? Utils.centsToInput(s.limit) : ''}">
                <span class="input-suffix" aria-hidden="true">€</span>
              </div>
              <button class="btn btn-primary" type="submit">Guardar</button>
            </div>
          </div>
          ${s.limit ? '<button class="btn btn-link btn-sm" type="button" data-action="remove-monthly-budget">Quitar presupuesto</button>' : ''}
        </form>
      </div>`;
  }

  function categoryCardHTML(s, daysLeft) {
    const name = escapeHTML(s.category.name);
    const id = escapeHTML(s.categoryId);
    const perDay = daysLeft && s.available > 0
      ? `<p class="budget-card-daily">${Icons.get('calendar', 14)}Unos ${formatMoney(Math.round(s.available / daysLeft))} al día durante ${daysLeft} día(s)</p>`
      : '';
    return `
      <article class="card budget-card level-${s.level}">
        <header class="budget-card-header">
          ${UI.categoryBadge(s.category)}
          <div class="grow">
            <h3>${name}</h3>
            <span class="muted">${formatMoney(s.limit)} al mes</span>
          </div>
          <div class="card-actions">
            <button class="btn-icon btn-icon-sm" data-action="edit-category-budget" data-id="${id}" aria-label="Editar límite de ${name}">${Icons.get('edit', 16)}</button>
            <button class="btn-icon btn-icon-sm btn-icon-danger" data-action="delete-category-budget" data-id="${id}" aria-label="Eliminar límite de ${name}">${Icons.get('trash', 16)}</button>
          </div>
        </header>
        <div class="budget-card-amounts">
          <strong>${UI.money(s.spent)}</strong>
          <span class="muted">${formatPercent(s.pct, 0)} usado</span>
        </div>
        ${UI.progressBar(s.pct, s.level, `Límite de ${s.category.name}`)}
        <div class="budget-card-numbers">
          ${statusPill(s.level)}
          <span class="${s.available >= 0 ? '' : 'amount-negative'}">
            ${s.available >= 0 ? `Quedan <strong>${formatMoney(s.available)}</strong>` : `<strong>${formatMoney(-s.available)}</strong> de exceso`}
          </span>
        </div>
        ${s.level === 'over'
          ? `<p class="budget-warning">${Icons.get('alert', 16)}Has superado tu presupuesto de ${escapeHTML(s.category.name.toLowerCase())}</p>`
          : perDay}
      </article>`;
  }

  function render(key) {
    const view = $('#view-presupuestos');
    const statuses = categoryStatuses(key);
    const limitsTotal = Utils.sumBy(statuses, (s) => s.limit);
    const monthly = data().monthly;
    const limited = statuses.map((s) => s.categoryId);
    const unlimited = Stats.categoriesForMonth(key).filter((c) => !limited.includes(c.categoryId) && Categories.exists(c.categoryId, 'expense'));
    // Días que quedan (con hoy) para repartir lo que queda de cada límite; solo en el mes actual
    const daysLeft = key === Utils.currentMonthKey() ? Utils.daysInMonth(key) - new Date().getDate() + 1 : 0;

    view.innerHTML = `
      <div class="grid grid-2-1">
        ${monthlyCardHTML(key)}
        <div class="card">
          <h2 class="card-title">${Icons.get('info', 18)}Resumen de límites</h2>
          <ul class="kv-list">
            <li><span>Categorías con límite</span><strong>${statuses.length}</strong></li>
            <li><span>Suma de límites</span><strong>${formatMoney(limitsTotal)}</strong></li>
            <li><span>Categorías superadas</span><strong class="${statuses.some((s) => s.level === 'over') ? 'amount-negative' : ''}">${statuses.filter((s) => s.level === 'over').length}</strong></li>
            <li><span>Cerca del límite</span><strong>${statuses.filter((s) => s.level === 'warn').length}</strong></li>
          </ul>
          ${monthly && limitsTotal > monthly
            ? `<p class="alert alert-warn">${Icons.get('alert', 16)}La suma de los límites por categoría (${formatMoney(limitsTotal)}) supera tu presupuesto mensual (${formatMoney(monthly)}).</p>`
            : ''}
          ${unlimited.length ? `
            <h3 class="list-title list-title-spaced">Con gasto y sin límite</h3>
            <ul class="simple-list">
              ${unlimited.map((c) => `
                <li>
                  ${UI.categoryBadge(c.category, 'sm')}
                  <span class="grow">
                    <strong>${escapeHTML(c.category.name)}</strong>
                    <small class="muted">${formatMoney(c.total)} este mes</small>
                  </span>
                  <button class="btn btn-link btn-sm" data-action="edit-category-budget-new" data-id="${escapeHTML(c.categoryId)}">Poner límite</button>
                </li>`).join('')}
            </ul>` : ''}
        </div>
      </div>

      <div class="section-header">
        <div>
          <h2>Presupuestos por categoría</h2>
          <p class="muted">Límites mensuales aplicados a ${Utils.monthLabel(key)}</p>
        </div>
        <button class="btn btn-primary" data-action="add-category-budget">${Icons.get('plus', 18)}Añadir límite</button>
      </div>

      ${statuses.length
        ? `<div class="budget-grid">${statuses.map((s) => categoryCardHTML(s, daysLeft)).join('')}</div>`
        : `<div class="card">${UI.emptyState({
          icon: 'pie', title: 'Sin límites por categoría',
          text: 'Define cuánto quieres gastar como máximo en cada categoría (por ejemplo, 300 € en alimentación).',
          action: '<button class="btn btn-primary" data-action="add-category-budget">Añadir límite</button>',
        })}</div>`}`;

    const form = $('#monthly-budget-form');
    form.addEventListener('submit', handleMonthlySubmit);
    UI.liveClearErrors(form);
  }

  const actions = {
    'add-category-budget': () => openCategoryForm(),
    'edit-category-budget': (id) => openCategoryForm(id),
    'edit-category-budget-new': (id) => {
      openCategoryForm();
      $('#budget-form').elements.categoryId.value = id;
    },
    'delete-category-budget': (id) => removeCategory(id),
    'remove-monthly-budget': () => removeMonthly(),
  };

  function init() {
    const form = $('#budget-form');
    form.addEventListener('submit', handleCategorySubmit);
    UI.liveClearErrors(form);
  }

  return { data, monthlyStatus, idealPace, plan, planNote, planFiguresHTML, categoryStatuses, render, actions, init };
})();
