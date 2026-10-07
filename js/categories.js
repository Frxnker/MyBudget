/**
 * categories.js
 * Categorías predeterminadas y personalizadas de gastos e ingresos: alta, edición, borrado
 * (moviendo antes sus movimientos a otra categoría) y estadísticas de cada una.
 */
const Categories = (() => {
  const { escapeHTML, $, formatMoney, formatPercent, formatDate } = Utils;

  // Paleta categórica (orden fijo): el color sigue a la categoría, no a su posición en la gráfica
  const DEFAULTS = [
    { id: 'exp-alimentacion', name: 'Alimentación', icon: '🛒', type: 'expense', color: '#2a78d6' },
    { id: 'exp-transporte', name: 'Transporte', icon: '🚌', type: 'expense', color: '#eb6834' },
    { id: 'exp-vivienda', name: 'Vivienda', icon: '🏠', type: 'expense', color: '#1baf7a' },
    { id: 'exp-ocio', name: 'Ocio', icon: '🎬', type: 'expense', color: '#eda100' },
    { id: 'exp-compras', name: 'Compras', icon: '🛍️', type: 'expense', color: '#e87ba4' },
    { id: 'exp-salud', name: 'Salud', icon: '💊', type: 'expense', color: '#008300' },
    { id: 'exp-educacion', name: 'Educación', icon: '📚', type: 'expense', color: '#4a3aa7' },
    { id: 'exp-suscripciones', name: 'Suscripciones', icon: '📺', type: 'expense', color: '#e34948' },
    { id: 'exp-viajes', name: 'Viajes', icon: '✈️', type: 'expense', color: '#184f95' },
    { id: 'exp-otros', name: 'Otros', icon: '📦', type: 'expense', color: '#8b8d98' },
    { id: 'inc-salario', name: 'Salario', icon: '💼', type: 'income', color: '#1baf7a' },
    { id: 'inc-freelance', name: 'Freelance', icon: '💻', type: 'income', color: '#2a78d6' },
    { id: 'inc-inversiones', name: 'Inversiones', icon: '📈', type: 'income', color: '#4a3aa7' },
    { id: 'inc-regalos', name: 'Regalos', icon: '🎁', type: 'income', color: '#e87ba4' },
    { id: 'inc-otros', name: 'Otros', icon: '💶', type: 'income', color: '#8b8d98' },
  ];

  const EMOJIS = ['🐶', '🎮', '☕', '🍔', '⚽', '🎵', '👶', '💡', '🔧', '🚗', '📱', '💄',
    '🎨', '🏋️', '🍷', '🧾', '🏦', '💰', '🪙', '🎓', '🌱', '🧸', '🛠️', '❤️'];

  // Colores sugeridos (los de la paleta de la app) con su nombre para los lectores de pantalla
  const SWATCHES = [
    ['#2a78d6', 'Azul'], ['#184f95', 'Azul marino'], ['#5b5bd6', 'Índigo'], ['#4a3aa7', 'Violeta'],
    ['#e87ba4', 'Rosa'], ['#e34948', 'Rojo'], ['#eb6834', 'Naranja'], ['#eda100', 'Ámbar'],
    ['#1baf7a', 'Verde'], ['#008300', 'Verde oscuro'], ['#0f9fb0', 'Turquesa'], ['#8b8d98', 'Gris'],
  ];

  const UNKNOWN = { id: '', name: 'Sin categoría', icon: '❔', type: 'expense', color: '#8b8d98', custom: false };

  function defaults() {
    return DEFAULTS.map((c) => ({ ...c, custom: false }));
  }

  function all() {
    return Store.get('categories') || [];
  }

  function byType(type) {
    return all().filter((c) => c.type === type);
  }

  function get(id) {
    return all().find((c) => c.id === id) || UNKNOWN;
  }

  function exists(id, type) {
    return all().some((c) => c.id === id && (!type || c.type === type));
  }

  /** Opciones para un <select> */
  function options(type) {
    return byType(type).map((c) => ({ value: c.id, label: `${c.icon}  ${c.name}` }));
  }

  /** Categoría "Otros" del tipo indicado: destino por defecto al borrar una categoría */
  function fallbackId(type) {
    return type === 'income' ? 'inc-otros' : 'exp-otros';
  }

  function save(data, id = null) {
    const list = all();
    if (id) {
      Store.set('categories', list.map((c) => (c.id === id ? { ...c, ...data } : c)));
    } else {
      Store.set('categories', [...list, { id: Utils.uid('cat'), ...data, custom: true }]);
    }
  }

  /** Cuántos movimientos y recurrentes usan una categoría y si tiene límite de presupuesto */
  function usage(id) {
    return {
      transactions: Transactions.all().filter((t) => t.categoryId === id).length,
      recurring: Store.get('recurring').filter((r) => r.categoryId === id).length,
      budget: Boolean(Store.get('budgets').byCategory[id]),
    };
  }

  /* ---------------------------------------------------------------
   * BORRADO
   * Solo se borran categorías personalizadas. Si tienen movimientos o recurrentes, antes hay que
   * elegir a qué categoría pasan: nunca se quedan movimientos sin categoría.
   * ------------------------------------------------------------- */

  let deletingId = null;

  async function remove(id) {
    const category = get(id);
    if (!category.custom) return;
    const used = usage(id);
    if (used.transactions || used.recurring) {
      openDeleteForm(id, used);
      return;
    }
    const ok = await UI.confirm({
      title: `Eliminar "${category.name}"`,
      message: `La categoría no tiene movimientos.${used.budget ? ' También se eliminará su límite de presupuesto.' : ''} Esta acción no se puede deshacer.`,
    });
    if (ok) commitRemove(id, null);
  }

  function openDeleteForm(id, used) {
    const form = $('#category-delete-form');
    form.reset();
    deletingId = id;
    const category = get(id);
    const parts = [];
    if (used.transactions) parts.push(`${used.transactions} movimiento${used.transactions === 1 ? '' : 's'}`);
    if (used.recurring) parts.push(`${used.recurring} gasto${used.recurring === 1 ? '' : 's'} recurrente${used.recurring === 1 ? '' : 's'}`);
    $('#category-delete-title').textContent = `Eliminar "${category.name}"`;
    $('#category-delete-message').textContent = `Esta categoría tiene ${parts.join(' y ')}. Elige a qué categoría pasarán antes de eliminarla.`;
    $('#category-delete-budget').hidden = !used.budget;
    UI.fillSelect(form.elements.target,
      byType(category.type).filter((c) => c.id !== id).map((c) => ({ value: c.id, label: `${c.icon}  ${c.name}` })),
      { selected: fallbackId(category.type) });
    UI.openModal('category-delete-modal');
  }

  function handleDeleteSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const category = get(deletingId);
    const target = form.elements.target.value;
    if (!target || target === deletingId || !exists(target, category.type)) {
      UI.showErrors(form, { target: 'Elige la categoría a la que pasarán los movimientos.' });
      return;
    }
    commitRemove(deletingId, target);
    UI.closeModal('category-delete-modal');
  }

  /** Borra la categoría y, si "target" no es null, mueve a ella sus movimientos y recurrentes */
  function commitRemove(id, target) {
    const category = get(id);
    const budgets = Store.get('budgets');
    const byCategory = { ...budgets.byCategory };
    delete byCategory[id];
    const move = (item) => (item.categoryId === id ? { ...item, categoryId: target } : item);
    Store.setMany({
      categories: all().filter((c) => c.id !== id),
      transactions: target ? Transactions.all().map(move) : Transactions.all(),
      recurring: target ? Store.get('recurring').map(move) : Store.get('recurring'),
      budgets: { ...budgets, byCategory },
    });
    UI.toast(target
      ? `Categoría "${category.name}" eliminada. Sus movimientos están ahora en "${get(target).name}"`
      : `Categoría "${category.name}" eliminada`);
  }

  /* ---------------------------------------------------------------
   * FORMULARIO (también para editar las predeterminadas: nombre, icono y color)
   * ------------------------------------------------------------- */

  let editingId = null;

  function markSwatch(color) {
    $('#color-swatches').querySelectorAll('[data-color]').forEach((button) => {
      const active = button.dataset.color.toLowerCase() === String(color).toLowerCase();
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function openForm(id = null, type = 'expense') {
    const form = $('#category-form');
    form.reset();
    editingId = id;
    const category = id ? get(id) : null;
    $('#category-modal-title').textContent = category ? 'Editar categoría' : 'Nueva categoría';
    form.elements.name.value = category ? category.name : '';
    form.elements.type.value = category ? category.type : type;
    form.elements.type.disabled = Boolean(category); // no se cambia el tipo de una categoría existente
    form.elements.color.value = category ? category.color : '#5b5bd6';
    form.elements.icon.value = category ? category.icon : '';
    markSwatch(form.elements.color.value);
    UI.openModal('category-modal');
  }

  function handleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const name = form.elements.name.value.trim();
    const type = form.elements.type.value;
    const icon = form.elements.icon.value.trim();
    const color = form.elements.color.value;
    const errors = {};

    if (!name) errors.name = 'El nombre es obligatorio.';
    else if (name.length > 30) errors.name = 'El nombre no puede tener más de 30 caracteres.';
    else if (byType(type).some((c) => c.id !== editingId && Utils.normalize(c.name) === Utils.normalize(name))) {
      errors.name = 'Ya existe una categoría con ese nombre.';
    }
    if (!icon) errors.icon = 'Elige un icono para la categoría.';
    if (!/^#[0-9a-f]{6}$/i.test(color)) errors.color = 'Elige un color válido.';
    if (!UI.showErrors(form, errors)) return;

    save({ name, type, icon, color }, editingId);
    UI.closeModal('category-modal');
    UI.toast(editingId ? 'Categoría actualizada' : `Categoría "${name}" creada`);
  }

  /* ---------------------------------------------------------------
   * ESTADÍSTICAS DE UNA CATEGORÍA (modal)
   * ------------------------------------------------------------- */

  let statsId = null;

  function tile(label, value, detail = '') {
    return `<div class="cat-stat"><span>${label}</span><strong>${value}</strong>${detail ? `<small>${detail}</small>` : ''}</div>`;
  }

  function openStats(id) {
    const key = App.currentMonth();
    const d = Stats.categoryDetail(id, key);
    const c = d.category;
    statsId = id;
    const isExpense = c.type === 'expense';
    const limit = isExpense ? Budget.data().byCategory[id] : 0;
    const max = Math.max(...d.history.map((h) => h.total), 1);

    $('#category-stats-badge').innerHTML = UI.categoryBadge(c);
    $('#category-stats-title').textContent = c.name;
    $('#category-stats-subtitle').textContent = `${isExpense ? 'Gasto' : 'Ingreso'} · ${Utils.monthLabel(key)}`;
    $('#category-stats-body').innerHTML = `
      <div class="cat-stats-grid">
        ${tile('Este mes', formatMoney(d.current), d.previous || d.current
          ? UI.compareFoot(d.current, d.previous, { goodWhenUp: !isExpense, label: 'el mes anterior' })
          : '')}
        ${tile('Media mensual', formatMoney(d.average), 'Últimos 6 meses')}
        ${tile(`Peso en ${isExpense ? 'los gastos' : 'los ingresos'}`, formatPercent(d.share, 0), 'de este mes')}
        ${tile('Movimientos', String(d.count), `${d.monthCount} este mes · ${formatMoney(d.total)} en total`)}
      </div>
      ${limit ? (() => {
        const pct = Utils.percent(d.current, limit);
        const level = UI.budgetLevel(pct);
        return `<div class="cat-stats-budget">
          <div class="budget-mini-top"><span>Límite mensual</span><span class="muted">${formatMoney(d.current)} de ${formatMoney(limit)}</span></div>
          ${UI.progressBar(pct, level, `Límite de ${c.name}`)}
        </div>`;
      })() : ''}
      <h3 class="list-title list-title-spaced">Últimos 6 meses</h3>
      <ol class="mini-bars" aria-label="Importe de los últimos 6 meses">
        ${d.history.map((h) => `
          <li class="${h.key === key ? 'is-current' : ''}">
            <span class="mini-bar-value">${h.total ? formatMoney(h.total, { decimals: false }) : '—'}</span>
            <span class="mini-bar" style="--h:${((h.total / max) * 100).toFixed(1)}%; --cat-color:${c.color}"></span>
            <span class="mini-bar-label">${Utils.monthLabel(h.key, true)}</span>
          </li>`).join('')}
      </ol>
      ${d.last ? `<p class="hint">${Icons.get('clock', 14)}<span>Último movimiento: "${escapeHTML(d.last.concept)}", ${formatMoney(d.last.amount)} el ${formatDate(d.last.date)}.</span></p>` : '<p class="muted">Todavía no hay movimientos en esta categoría.</p>'}`;
    UI.openModal('category-stats-modal');
  }

  /* ---------------------------------------------------------------
   * LISTA (Configuración)
   * ------------------------------------------------------------- */

  function renderList(type) {
    const counts = {};
    Transactions.all().forEach((t) => { counts[t.categoryId] = (counts[t.categoryId] || 0) + 1; });
    return byType(type).map((c) => {
      const id = escapeHTML(c.id);
      const name = escapeHTML(c.name);
      const count = counts[c.id] || 0;
      return `
        <li class="category-item">
          ${UI.categoryBadge(c, 'sm')}
          <span class="category-name">${name}<small>${count ? `${count} movimiento${count === 1 ? '' : 's'}` : 'Sin movimientos'}</small></span>
          ${c.custom ? '<span class="badge">Personalizada</span>' : '<span class="badge badge-muted">Predeterminada</span>'}
          <span class="category-actions">
            <button class="btn-icon btn-icon-sm" data-action="category-stats" data-id="${id}" title="Estadísticas" aria-label="Estadísticas de ${name}">${Icons.get('chart', 16)}</button>
            <button class="btn-icon btn-icon-sm" data-action="edit-category" data-id="${id}" title="Editar" aria-label="Editar ${name}">${Icons.get('edit', 16)}</button>
            ${c.custom ? `<button class="btn-icon btn-icon-sm btn-icon-danger" data-action="delete-category" data-id="${id}" title="Eliminar" aria-label="Eliminar ${name}">${Icons.get('trash', 16)}</button>` : ''}
          </span>
        </li>`;
    }).join('');
  }

  function init() {
    const picker = $('#emoji-picker');
    picker.innerHTML = EMOJIS.map((e) => `<button type="button" class="emoji-option" data-emoji="${e}" aria-label="Usar ${e} como icono">${e}</button>`).join('');
    picker.addEventListener('click', (event) => {
      const button = event.target.closest('[data-emoji]');
      if (!button) return;
      const input = $('#cat-icon');
      input.value = button.dataset.emoji;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const swatches = $('#color-swatches');
    swatches.innerHTML = SWATCHES.map(([color, label]) => `
      <button type="button" class="color-swatch" data-color="${color}" style="--swatch:${color}" aria-label="${label}" aria-pressed="false" title="${label}"></button>`).join('');
    swatches.addEventListener('click', (event) => {
      const button = event.target.closest('[data-color]');
      if (!button) return;
      $('#cat-color').value = button.dataset.color;
      markSwatch(button.dataset.color);
    });
    $('#cat-color').addEventListener('input', (event) => markSwatch(event.target.value));

    const form = $('#category-form');
    form.addEventListener('submit', handleSubmit);
    UI.liveClearErrors(form);

    const deleteForm = $('#category-delete-form');
    deleteForm.addEventListener('submit', handleDeleteSubmit);
    UI.liveClearErrors(deleteForm);
  }

  const actions = {
    'category-stats': (id) => openStats(id),
    'category-stats-edit': () => {
      UI.closeModal('category-stats-modal');
      openForm(statsId);
    },
    'category-movements': () => {
      UI.closeModal('category-stats-modal');
      Transactions.showCategory(statsId);
      App.navigate('movimientos');
    },
  };

  return {
    defaults, all, byType, get, exists, options, fallbackId, usage, openForm, remove, openStats,
    init, renderList, actions,
  };
})();
