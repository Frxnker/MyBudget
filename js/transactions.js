/**
 * transactions.js
 * Movimientos (gastos e ingresos): alta, edición, borrado, duplicado, filtros, orden e historial.
 */
const Transactions = (() => {
  const { $, escapeHTML, formatMoney, formatDate, normalize } = Utils;

  const TYPES = { expense: 'Gasto', income: 'Ingreso' };

  const METHODS = {
    expense: ['Tarjeta de débito', 'Tarjeta de crédito', 'Efectivo', 'Bizum', 'Transferencia', 'Domiciliación', 'PayPal'],
    income: ['Transferencia', 'Nómina', 'Efectivo', 'Bizum', 'PayPal'],
  };

  const PAGE_SIZE = 30;

  const state = {
    filters: { text: '', type: 'all', categoryId: '', from: '', to: '', method: '' },
    sort: { field: 'date', dir: 'desc' },
    visible: PAGE_SIZE,
    mounted: false,
  };

  /* ---------------------------------------------------------------
   * DATOS
   * ------------------------------------------------------------- */

  function all() {
    return Store.get('transactions') || [];
  }

  function get(id) {
    return all().find((t) => t.id === id);
  }

  function forMonth(key, type = null) {
    return all().filter((t) => t.date.startsWith(key) && (!type || t.type === type));
  }

  function allMethods() {
    const set = new Set([...METHODS.expense, ...METHODS.income]);
    all().forEach((t) => t.method && set.add(t.method));
    return [...set];
  }

  function add(data) {
    const tx = { id: Utils.uid('tx'), ...data, createdAt: Date.now() };
    Store.set('transactions', [...all(), tx]);
    return tx;
  }

  function update(id, data) {
    Store.set('transactions', all().map((t) => (t.id === id ? { ...t, ...data, demo: undefined } : t)));
  }

  async function remove(id) {
    const tx = get(id);
    if (!tx) return;
    const ok = await UI.confirm({
      title: `Eliminar ${TYPES[tx.type].toLowerCase()}`,
      message: `Se eliminará "${tx.concept}" (${formatMoney(tx.amount)}). Podrás deshacerlo durante unos segundos desde el aviso.`,
    });
    if (!ok) return;
    Store.set('transactions', all().filter((t) => t.id !== id));
    UI.toast(`${TYPES[tx.type]} eliminado`, 'info', 6000, {
      label: 'Deshacer',
      onClick: () => {
        if (get(id)) return;
        Store.set('transactions', [...all(), tx]);
        UI.toast(`"${tx.concept}" restaurado`);
      },
    });
  }

  /* ---------------------------------------------------------------
   * EXPORTAR A CSV (separador ";" y coma decimal para Excel en español)
   * ------------------------------------------------------------- */

  function csvField(value) {
    let text = String(value ?? '');
    // Evita que Excel interprete el texto como una fórmula
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportCSV(list, filename) {
    if (!list.length) {
      UI.toast('No hay movimientos que exportar', 'warning');
      return;
    }
    const header = ['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Método', 'Cantidad (€)', 'Notas'];
    const rows = applySort(list, { field: 'date', dir: 'asc' }).map((t) => [
      t.date,
      TYPES[t.type],
      csvField(t.concept),
      csvField(Categories.get(t.categoryId).name),
      csvField(t.method),
      // La cantidad se escribe sin pasar por csvField para conservar el signo
      ((t.type === 'income' ? 1 : -1) * t.amount / 100).toFixed(2).replace('.', ','),
      csvField(t.notes),
    ].join(';'));
    // El BOM ("﻿") hace que Excel reconozca las tildes en UTF-8
    Utils.downloadFile(filename, `﻿${[header.join(';'), ...rows].join('\r\n')}`, 'text/csv;charset=utf-8');
    UI.toast(`${list.length} movimientos exportados a CSV`);
  }

  /* ---------------------------------------------------------------
   * FILTROS Y ORDEN
   * ------------------------------------------------------------- */

  function applyFilters(list, filters) {
    const text = normalize(filters.text.trim());
    return list.filter((t) => {
      if (filters.type !== 'all' && t.type !== filters.type) return false;
      if (filters.categoryId && t.categoryId !== filters.categoryId) return false;
      if (filters.method && t.method !== filters.method) return false;
      if (filters.from && t.date < filters.from) return false;
      if (filters.to && t.date > filters.to) return false;
      if (text) {
        const haystack = normalize(`${t.concept} ${t.notes} ${Categories.get(t.categoryId).name} ${t.method}`);
        if (!haystack.includes(text)) return false;
      }
      return true;
    });
  }

  function applySort(list, { field, dir }) {
    const factor = dir === 'asc' ? 1 : -1;
    const compare = {
      date: (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
      amount: (a, b) => a.amount - b.amount,
      category: (a, b) => Categories.get(a.categoryId).name.localeCompare(Categories.get(b.categoryId).name, 'es'),
      concept: (a, b) => a.concept.localeCompare(b.concept, 'es'),
    }[field];
    return [...list].sort((a, b) => compare(a, b) * factor);
  }

  function filtered() {
    return applySort(applyFilters(all(), state.filters), state.sort);
  }

  /** Usado por el buscador global */
  function setSearch(text) {
    state.filters = { text, type: 'all', categoryId: '', from: '', to: '', method: '' };
    state.visible = PAGE_SIZE;
    if (state.mounted) syncFilterInputs();
  }

  /* ---------------------------------------------------------------
   * FORMULARIO (modal)
   * ------------------------------------------------------------- */

  let editingId = null;
  let extraData = {}; // datos extra al guardar (p. ej. desde un gasto recurrente)

  /**
   * Abre el formulario.
   *  - openForm({ type: 'expense' })        → nuevo gasto
   *  - openForm({ id })                     → editar
   *  - openForm({ duplicateOf: id })        → duplicar (nuevo con los datos de otro)
   *  - openForm({ prefill: {...} })         → nuevo con datos precargados
   */
  function openForm({ type = 'expense', id = null, duplicateOf = null, prefill = null } = {}) {
    const form = $('#tx-form');
    form.reset();
    editingId = id;
    extraData = {};

    const source = id ? get(id) : duplicateOf ? get(duplicateOf) : prefill;
    const txType = source?.type || type;

    form.elements.type.value = txType;
    updateFormForType(txType, source?.categoryId, source?.method);
    form.elements.concept.value = source?.concept || '';
    form.elements.amount.value = source?.amount ? Utils.centsToInput(source.amount) : '';
    form.elements.date.value = id ? source.date : Utils.todayISO();
    form.elements.notes.value = source?.notes || '';
    if (prefill?.recurringId) extraData.recurringId = prefill.recurringId;

    let title = txType === 'expense' ? 'Nuevo gasto' : 'Nuevo ingreso';
    if (id) title = 'Editar movimiento';
    if (duplicateOf) title = 'Duplicar movimiento';
    $('#tx-modal-title').textContent = title;
    $('#tx-submit').textContent = id ? 'Guardar cambios' : 'Guardar';
    UI.openModal('tx-modal');
  }

  /** Cambia categorías, métodos y estilos según sea gasto o ingreso */
  function updateFormForType(type, categoryId = '', method = '') {
    const form = $('#tx-form');
    UI.fillSelect(form.elements.categoryId, Categories.options(type), {
      placeholder: 'Selecciona una categoría', selected: categoryId,
    });
    const methods = [...METHODS[type]];
    if (method && !methods.includes(method)) methods.push(method);
    UI.fillSelect(form.elements.method, methods.map((m) => ({ value: m, label: m })), {
      placeholder: 'Selecciona un método', selected: method,
    });
    $('#tx-method-label').textContent = type === 'expense' ? 'Método de pago *' : 'Método de ingreso *';
    form.dataset.type = type;
  }

  function validate(form) {
    const values = {
      type: form.elements.type.value,
      concept: form.elements.concept.value.trim(),
      date: form.elements.date.value,
      categoryId: form.elements.categoryId.value,
      method: form.elements.method.value,
      notes: form.elements.notes.value.trim(),
    };
    const errors = {};

    if (!values.concept) errors.concept = 'El concepto es obligatorio.';
    else if (values.concept.length < 2) errors.concept = 'El concepto debe tener al menos 2 caracteres.';

    const amount = UI.validateAmount(form.elements.amount.value);
    if (amount.error) errors.amount = amount.error;

    if (!values.date) errors.date = 'La fecha es obligatoria.';
    else if (!Utils.isValidISODate(values.date)) errors.date = 'La fecha no es válida.';

    if (!values.categoryId) errors.categoryId = 'Selecciona una categoría.';
    else if (!Categories.exists(values.categoryId, values.type)) errors.categoryId = 'La categoría no es válida.';

    if (!values.method) errors.method = values.type === 'expense' ? 'Selecciona un método de pago.' : 'Selecciona un método de ingreso.';

    return { values: { ...values, amount: amount.cents }, errors };
  }

  function handleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const { values, errors } = validate(form);
    if (!UI.showErrors(form, errors)) return;

    const label = TYPES[values.type];
    if (editingId) {
      update(editingId, values);
      UI.toast(`${label} actualizado correctamente`);
    } else {
      add({ ...values, ...extraData });
      UI.toast(`${label} añadido correctamente`);
    }
    UI.closeModal('tx-modal');
  }

  function initForm() {
    const form = $('#tx-form');
    form.addEventListener('submit', handleSubmit);
    form.addEventListener('change', (event) => {
      if (event.target.name === 'type') {
        updateFormForType(event.target.value);
        if (!editingId) $('#tx-modal-title').textContent = event.target.value === 'expense' ? 'Nuevo gasto' : 'Nuevo ingreso';
      }
    });
    UI.liveClearErrors(form);
  }

  /* ---------------------------------------------------------------
   * VISTA: HISTORIAL
   * ------------------------------------------------------------- */

  function mount() {
    const view = $('#view-movimientos');
    view.innerHTML = `
      <div class="page-actions">
        <button class="btn btn-expense" data-action="add-expense">${Icons.get('arrowDownRight', 18)}Añadir gasto</button>
        <button class="btn btn-income" data-action="add-income">${Icons.get('arrowUpRight', 18)}Añadir ingreso</button>
        <button class="btn btn-ghost" data-action="export-csv-filtered" title="Exporta los movimientos que coinciden con los filtros">${Icons.get('download', 18)}Exportar CSV</button>
      </div>

      <div class="card filters-card">
        <div class="filters-header">
          <h2 class="card-title">${Icons.get('filter', 18)}Filtros</h2>
          <div class="filters-buttons">
            <button class="btn btn-ghost btn-sm" id="filter-clear" type="button">Limpiar filtros</button>
            <button class="btn btn-ghost btn-sm filters-toggle" id="filters-toggle" type="button" aria-expanded="false" aria-controls="filters-grid">Mostrar</button>
          </div>
        </div>
        <div class="filters-grid" id="filters-grid">
          <div class="field field-search">
            <label for="filter-text">Buscar</label>
            <input type="search" id="filter-text" placeholder="Concepto, notas, categoría…">
          </div>
          <div class="field">
            <label for="filter-type">Tipo</label>
            <select id="filter-type">
              <option value="all">Todos</option>
              <option value="income">Ingresos</option>
              <option value="expense">Gastos</option>
            </select>
          </div>
          <div class="field">
            <label for="filter-category">Categoría</label>
            <select id="filter-category"></select>
          </div>
          <div class="field">
            <label for="filter-method">Método</label>
            <select id="filter-method"></select>
          </div>
          <div class="field">
            <label for="filter-from">Desde</label>
            <input type="date" id="filter-from">
          </div>
          <div class="field">
            <label for="filter-to">Hasta</label>
            <input type="date" id="filter-to">
          </div>
          <div class="field field-sort">
            <label for="filter-sort">Ordenar por</label>
            <select id="filter-sort">
              <option value="date-desc">Más recientes</option>
              <option value="date-asc">Más antiguos</option>
              <option value="amount-desc">Mayor cantidad</option>
              <option value="amount-asc">Menor cantidad</option>
              <option value="category-asc">Categoría A-Z</option>
              <option value="category-desc">Categoría Z-A</option>
            </select>
          </div>
        </div>
      </div>

      <div class="summary-strip" id="tx-summary"></div>
      <div class="card table-card" id="tx-table"></div>`;

    const onFilter = () => {
      readFilterInputs();
      state.visible = PAGE_SIZE;
      renderResults();
    };
    $('#filter-text').addEventListener('input', Utils.debounce(onFilter, 200));
    ['#filter-type', '#filter-category', '#filter-method', '#filter-from', '#filter-to'].forEach((sel) => {
      $(sel).addEventListener('change', () => {
        if (sel === '#filter-type') renderCategoryFilter();
        onFilter();
      });
    });
    $('#filter-sort').addEventListener('change', (event) => {
      const [field, dir] = event.target.value.split('-');
      state.sort = { field, dir };
      renderResults();
    });
    $('#filters-toggle').addEventListener('click', (event) => {
      const open = $('.filters-card').classList.toggle('is-open');
      event.currentTarget.setAttribute('aria-expanded', String(open));
      event.currentTarget.textContent = open ? 'Ocultar' : 'Mostrar';
    });
    $('#filter-clear').addEventListener('click', () => {
      setSearch('');
      renderResults();
    });

    // Delegación: cabeceras ordenables y "mostrar más"
    $('#tx-table').addEventListener('click', (event) => {
      const sortBtn = event.target.closest('[data-sort]');
      if (sortBtn) {
        const field = sortBtn.dataset.sort;
        state.sort = {
          field,
          dir: state.sort.field === field && state.sort.dir === 'desc' ? 'asc' : 'desc',
        };
        $('#filter-sort').value = `${state.sort.field}-${state.sort.dir}`;
        renderResults();
      }
      if (event.target.closest('#tx-more')) {
        state.visible += PAGE_SIZE;
        renderResults();
      }
    });

    state.mounted = true;
  }

  function readFilterInputs() {
    state.filters = {
      text: $('#filter-text').value,
      type: $('#filter-type').value,
      categoryId: $('#filter-category').value,
      method: $('#filter-method').value,
      from: $('#filter-from').value,
      to: $('#filter-to').value,
    };
  }

  function syncFilterInputs() {
    const f = state.filters;
    $('#filter-text').value = f.text;
    $('#filter-type').value = f.type;
    renderCategoryFilter();
    $('#filter-category').value = f.categoryId;
    $('#filter-method').value = f.method;
    $('#filter-from').value = f.from;
    $('#filter-to').value = f.to;
    $('#filter-sort').value = `${state.sort.field}-${state.sort.dir}`;
  }

  function renderCategoryFilter() {
    const select = $('#filter-category');
    const type = $('#filter-type').value;
    const current = state.filters.categoryId;
    const group = (t, label) => `<optgroup label="${label}">${
      Categories.byType(t).map((c) => `<option value="${escapeHTML(c.id)}">${escapeHTML(`${c.icon}  ${c.name}`)}</option>`).join('')
    }</optgroup>`;
    select.innerHTML = '<option value="">Todas</option>'
      + (type !== 'income' ? group('expense', 'Gastos') : '')
      + (type !== 'expense' ? group('income', 'Ingresos') : '');
    // Si la categoría elegida ya no es compatible con el tipo, se limpia
    select.value = [...select.options].some((o) => o.value === current) ? current : '';
    state.filters.categoryId = select.value;
  }

  function renderMethodFilter() {
    UI.fillSelect($('#filter-method'), allMethods().map((m) => ({ value: m, label: m })), {
      placeholder: 'Todos', selected: state.filters.method,
    });
  }

  function hasActiveFilters() {
    const f = state.filters;
    return Boolean(f.text || f.type !== 'all' || f.categoryId || f.method || f.from || f.to);
  }

  function sortHeader(field, label) {
    const active = state.sort.field === field;
    const icon = active ? (state.sort.dir === 'asc' ? 'chevronUp' : 'chevronDown') : 'sort';
    return `<button class="th-sort ${active ? 'is-active' : ''}" data-sort="${field}"
      aria-label="Ordenar por ${label}">${label}${Icons.get(icon, 14)}</button>`;
  }

  /** Fila de la tabla. Se reutiliza en otras vistas */
  function rowHTML(t) {
    const category = Categories.get(t.categoryId);
    const sign = t.type === 'income' ? 1 : -1;
    return `
      <tr>
        <td data-label="Fecha" class="nowrap">${formatDate(t.date)}</td>
        <td data-label="Concepto" class="td-concept">
          <div class="concept-cell">
            ${UI.categoryBadge(category, 'sm')}
            <div>
              <strong>${escapeHTML(t.concept)}</strong>
              ${t.notes ? `<small class="muted">${escapeHTML(t.notes)}</small>` : ''}
            </div>
          </div>
        </td>
        <td data-label="Categoría">${escapeHTML(category.name)}</td>
        <td data-label="Tipo"><span class="pill pill-${t.type}">${TYPES[t.type]}</span></td>
        <td data-label="Método">${escapeHTML(t.method || '—')}</td>
        <td data-label="Cantidad" class="td-amount amount-${t.type}">${formatMoney(sign * t.amount, { sign: true })}</td>
        <td data-label="Acciones" class="td-actions">
          <button class="btn-icon btn-icon-sm" data-action="edit-tx" data-id="${escapeHTML(t.id)}" title="Editar" aria-label="Editar ${escapeHTML(t.concept)}">${Icons.get('edit', 16)}</button>
          <button class="btn-icon btn-icon-sm" data-action="duplicate-tx" data-id="${escapeHTML(t.id)}" title="Duplicar" aria-label="Duplicar ${escapeHTML(t.concept)}">${Icons.get('copy', 16)}</button>
          <button class="btn-icon btn-icon-sm btn-icon-danger" data-action="delete-tx" data-id="${escapeHTML(t.id)}" title="Eliminar" aria-label="Eliminar ${escapeHTML(t.concept)}">${Icons.get('trash', 16)}</button>
        </td>
      </tr>`;
  }

  function renderResults() {
    const list = filtered();
    const income = Utils.sumBy(list.filter((t) => t.type === 'income'), (t) => t.amount);
    const expense = Utils.sumBy(list.filter((t) => t.type === 'expense'), (t) => t.amount);

    $('#tx-summary').innerHTML = `
      <div class="summary-item"><span>Movimientos</span><strong>${list.length}</strong></div>
      <div class="summary-item"><span>Ingresos</span><strong class="amount-income">${formatMoney(income)}</strong></div>
      <div class="summary-item"><span>Gastos</span><strong class="amount-expense">${formatMoney(expense)}</strong></div>
      <div class="summary-item"><span>Balance</span><strong>${formatMoney(income - expense, { sign: true })}</strong></div>`;

    $('#filter-clear').disabled = !hasActiveFilters();
    const table = $('#tx-table');
    if (!list.length) {
      table.innerHTML = all().length
        ? UI.emptyState({
          icon: 'search', title: 'No hay resultados',
          text: 'Ningún movimiento coincide con los filtros aplicados.',
          action: '<button class="btn btn-ghost" data-action="clear-filters">Limpiar filtros</button>',
        })
        : UI.emptyState({
          icon: 'inbox', title: 'Todavía no hay movimientos',
          text: 'Añade tu primer gasto o ingreso para empezar a controlar tus finanzas.',
          action: '<button class="btn btn-primary" data-action="add-expense">Añadir gasto</button>',
        });
      return;
    }

    const visible = list.slice(0, state.visible);
    table.innerHTML = `
      <div class="table-wrapper">
        <table class="table tx-table">
          <thead>
            <tr>
              <th>${sortHeader('date', 'Fecha')}</th>
              <th>Concepto</th>
              <th>${sortHeader('category', 'Categoría')}</th>
              <th>Tipo</th>
              <th>Método</th>
              <th class="th-amount">${sortHeader('amount', 'Cantidad')}</th>
              <th class="th-actions"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>${visible.map(rowHTML).join('')}</tbody>
        </table>
      </div>
      ${list.length > visible.length
        ? `<div class="table-footer"><button class="btn btn-ghost" id="tx-more">Mostrar más (${list.length - visible.length} restantes)</button></div>`
        : ''}`;
  }

  function render() {
    if (!state.mounted) mount();
    renderMethodFilter();
    syncFilterInputs();
    renderResults();
  }

  /* ---------------------------------------------------------------
   * ACCIONES (data-action="…")
   * ------------------------------------------------------------- */
  const actions = {
    'add-expense': () => openForm({ type: 'expense' }),
    'add-income': () => openForm({ type: 'income' }),
    'edit-tx': (id) => openForm({ id }),
    'duplicate-tx': (id) => openForm({ duplicateOf: id }),
    'delete-tx': (id) => remove(id),
    'clear-filters': () => { setSearch(''); renderResults(); },
    'export-csv-filtered': () => exportCSV(filtered(), `mybudget-movimientos-${Utils.todayISO()}.csv`),
    'export-csv-all': () => exportCSV(all(), `mybudget-movimientos-${Utils.todayISO()}.csv`),
  };

  function init() {
    initForm();
  }

  return {
    TYPES, METHODS, all, get, forMonth, add, update, remove, openForm,
    setSearch, render, rowHTML, actions, init, applyFilters,
  };
})();
