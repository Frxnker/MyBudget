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

  /** Avisos de presupuesto superado o cerca del límite (para el dashboard) */
  function alerts(key) {
    const list = [];
    const monthly = monthlyStatus(key);
    if (monthly.limit && monthly.level === 'over') {
      list.push({ level: 'over', message: `Has superado tu presupuesto mensual en ${formatMoney(-monthly.available)}` });
    } else if (monthly.limit && monthly.level === 'warn') {
      list.push({ level: 'warn', message: `Has usado el ${formatPercent(monthly.pct, 0)} de tu presupuesto mensual` });
    }
    categoryStatuses(key).forEach((s) => {
      if (s.level === 'over') {
        list.push({ level: 'over', message: `Has superado tu presupuesto de ${s.category.name.toLowerCase()} (${formatMoney(s.spent)} de ${formatMoney(s.limit)})` });
      }
    });
    return list;
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

  const STATUS_TEXT = {
    ok: 'Vas bien, sigue así.',
    warn: 'Cuidado: estás cerca del límite.',
    over: 'Has superado el presupuesto.',
  };

  function monthlyCardHTML(key) {
    const s = monthlyStatus(key);
    const isCurrent = key === Utils.currentMonthKey();
    const daysLeft = Utils.daysInMonth(key) - Stats.elapsedDaysInMonth(key) + (isCurrent ? 1 : 0);

    const body = s.limit
      ? `
        <div class="budget-figures">
          <div><span>Presupuesto</span><strong>${formatMoney(s.limit)}</strong></div>
          <div><span>Gastado</span><strong class="amount-expense">${formatMoney(s.spent)}</strong></div>
          <div><span>${s.available >= 0 ? 'Disponible' : 'Exceso'}</span>
            <strong class="${s.available >= 0 ? 'amount-income' : 'amount-expense'}">${formatMoney(Math.abs(s.available))}</strong></div>
        </div>
        ${UI.progressBar(s.pct, s.level, 'Presupuesto mensual utilizado')}
        <div class="budget-status status-${s.level}">
          ${Icons.get(s.level === 'ok' ? 'check' : 'alert', 16)}
          <span><strong>${formatPercent(s.pct)}</strong> utilizado · ${STATUS_TEXT[s.level]}</span>
        </div>
        ${isCurrent && s.available > 0 && daysLeft > 0
          ? `<p class="hint">Puedes gastar <strong>${formatMoney(Math.floor(s.available / daysLeft))}</strong> al día durante los ${daysLeft} días que quedan de mes.</p>`
          : ''}`
      : '<p class="muted">Aún no has definido un presupuesto mensual. Establece una cantidad máxima de gasto para cada mes.</p>';

    return `
      <div class="card budget-main">
        <div class="card-header">
          <div>
            <h2 class="card-title">${Icons.get('pie', 18)}Presupuesto mensual</h2>
            <p class="muted">${Utils.monthLabel(key)}</p>
          </div>
        </div>
        ${body}
        <form class="inline-form" id="monthly-budget-form" novalidate>
          <div class="field">
            <label for="monthly-budget-input">${s.limit ? 'Cambiar presupuesto (€)' : 'Presupuesto mensual (€)'}</label>
            <div class="input-group">
              <input type="text" id="monthly-budget-input" name="monthly" inputmode="decimal" autocomplete="off"
                placeholder="Ej. 1000" value="${s.limit ? Utils.centsToInput(s.limit) : ''}">
              <button class="btn btn-primary" type="submit">Guardar</button>
            </div>
          </div>
          ${s.limit ? '<button class="btn btn-ghost btn-sm" type="button" data-action="remove-monthly-budget">Quitar presupuesto</button>' : ''}
        </form>
      </div>`;
  }

  function categoryCardHTML(s) {
    return `
      <article class="card budget-card level-${s.level}">
        <header class="budget-card-header">
          ${UI.categoryBadge(s.category)}
          <div>
            <h3>${escapeHTML(s.category.name)}</h3>
            <span class="muted">${formatMoney(s.limit)}/mes</span>
          </div>
          <div class="card-actions">
            <button class="btn-icon btn-icon-sm" data-action="edit-category-budget" data-id="${escapeHTML(s.categoryId)}" aria-label="Editar límite de ${escapeHTML(s.category.name)}">${Icons.get('edit', 16)}</button>
            <button class="btn-icon btn-icon-sm btn-icon-danger" data-action="delete-category-budget" data-id="${escapeHTML(s.categoryId)}" aria-label="Eliminar límite de ${escapeHTML(s.category.name)}">${Icons.get('trash', 16)}</button>
          </div>
        </header>
        ${UI.progressBar(s.pct, s.level, `Límite de ${s.category.name}`)}
        <div class="budget-card-numbers">
          <span>${formatMoney(s.spent)} gastado</span>
          <strong class="${s.available >= 0 ? '' : 'amount-expense'}">
            ${s.available >= 0 ? `${formatMoney(s.available)} disponible` : `${formatMoney(-s.available)} de exceso`}
          </strong>
        </div>
        ${s.level === 'over'
          ? `<p class="budget-warning">${Icons.get('alert', 16)}Has superado tu presupuesto de ${escapeHTML(s.category.name.toLowerCase())}</p>`
          : s.level === 'warn' ? `<p class="budget-warning is-warn">${Icons.get('alert', 16)}Te queda poco margen (${formatPercent(s.pct, 0)} usado)</p>` : ''}
      </article>`;
  }

  function render(key) {
    const view = $('#view-presupuestos');
    const statuses = categoryStatuses(key);
    const limitsTotal = Utils.sumBy(statuses, (s) => s.limit);
    const monthly = data().monthly;
    const limited = statuses.map((s) => s.categoryId);
    const unlimited = Stats.categoriesForMonth(key).filter((c) => !limited.includes(c.categoryId) && Categories.exists(c.categoryId, 'expense'));

    view.innerHTML = `
      <div class="grid grid-2-1">
        ${monthlyCardHTML(key)}
        <div class="card">
          <h2 class="card-title">${Icons.get('info', 18)}Resumen de límites</h2>
          <ul class="kv-list">
            <li><span>Categorías con límite</span><strong>${statuses.length}</strong></li>
            <li><span>Suma de límites</span><strong>${formatMoney(limitsTotal)}</strong></li>
            <li><span>Categorías superadas</span><strong class="${statuses.some((s) => s.level === 'over') ? 'amount-expense' : ''}">${statuses.filter((s) => s.level === 'over').length}</strong></li>
            <li><span>Cerca del límite</span><strong>${statuses.filter((s) => s.level === 'warn').length}</strong></li>
          </ul>
          ${monthly && limitsTotal > monthly
            ? `<p class="alert alert-warn">${Icons.get('alert', 16)}La suma de los límites por categoría (${formatMoney(limitsTotal)}) supera tu presupuesto mensual (${formatMoney(monthly)}).</p>`
            : ''}
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
        ? `<div class="budget-grid">${statuses.map(categoryCardHTML).join('')}</div>`
        : `<div class="card">${UI.emptyState({
          icon: 'pie', title: 'Sin límites por categoría',
          text: 'Define cuánto quieres gastar como máximo en cada categoría (por ejemplo, 300 € en alimentación).',
          action: '<button class="btn btn-primary" data-action="add-category-budget">Añadir límite</button>',
        })}</div>`}

      ${unlimited.length ? `
        <div class="card">
          <h2 class="card-title">${Icons.get('tag', 18)}Categorías con gasto y sin límite</h2>
          <ul class="simple-list">
            ${unlimited.map((c) => `
              <li>
                ${UI.categoryBadge(c.category, 'sm')}
                <span class="grow">${escapeHTML(c.category.name)}</span>
                <strong>${formatMoney(c.total)}</strong>
                <button class="btn btn-ghost btn-sm" data-action="edit-category-budget-new" data-id="${escapeHTML(c.categoryId)}">Poner límite</button>
              </li>`).join('')}
          </ul>
        </div>` : ''}`;

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

  return { data, monthlyStatus, categoryStatuses, alerts, render, actions, init };
})();
