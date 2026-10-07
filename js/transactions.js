/**
 * transactions.js
 * Movimientos (gastos e ingresos): alta, edición, borrado, duplicado, recibos, búsqueda, filtros,
 * orden e historial.
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

  /*
   * Índices en memoria. Store sustituye el array completo en cada cambio (nunca lo modifica),
   * así que basta con comparar la referencia para saber si hay que reconstruirlos.
   * Las listas que devuelven son de solo lectura: no hay que modificarlas.
   */
  let indexedList = null;
  let byMonth = new Map();   // "AAAA-MM" → movimientos de ese mes
  let byDateDesc = [];       // todos los movimientos, del más reciente al más antiguo

  function ensureIndex() {
    const list = all();
    if (list === indexedList) return;
    byMonth = new Map();
    list.forEach((t) => {
      const key = t.date.slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(t);
    });
    byDateDesc = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    indexedList = list;
  }

  /** Movimientos de un mes ("AAAA-MM"), opcionalmente solo de un tipo */
  function forMonth(key, type = null) {
    ensureIndex();
    const list = byMonth.get(key) || [];
    return type ? list.filter((t) => t.type === type) : list;
  }

  /** Los "limit" movimientos más recientes */
  function recent(limit = 6) {
    ensureIndex();
    return byDateDesc.slice(0, limit);
  }

  /** Movimientos entre dos fechas ISO (ambas incluidas). Usa el índice por meses */
  function between(from, to) {
    ensureIndex();
    if (from > to) return [];
    const result = [];
    for (let key = from.slice(0, 7); key <= to.slice(0, 7); key = Utils.addMonths(key, 1)) {
      (byMonth.get(key) || []).forEach((t) => {
        if (t.date >= from && t.date <= to) result.push(t);
      });
    }
    return result;
  }

  /** Meses ("AAAA-MM") que tienen algún movimiento, del más reciente al más antiguo */
  function monthKeys() {
    ensureIndex();
    return [...byMonth.keys()].sort().reverse();
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
    // El recibo se borra cuando ya no se puede deshacer (si se cierra la app antes, lo limpia Receipts.prune)
    if (tx.receiptId) {
      setTimeout(() => {
        if (!get(id)) Receipts.remove(tx.receiptId).catch(() => {});
      }, 7000);
    }
  }

  /** Datos de una copia de un movimiento: los mismos datos con la fecha de hoy (sin recibo ni enlaces) */
  function duplicateData(t, today = Utils.todayISO()) {
    return {
      type: t.type,
      concept: t.concept,
      amount: t.amount,
      categoryId: t.categoryId,
      method: t.method,
      notes: t.notes,
      date: today,
    };
  }

  /** Crea al momento una copia con fecha de hoy; el aviso permite editarla */
  function duplicate(id) {
    const source = get(id);
    if (!source) return;
    const copy = add(duplicateData(source));
    UI.toast(`"${source.concept}" duplicado con fecha de hoy`, 'success', 6000, {
      label: 'Editar',
      onClick: () => openForm({ id: copy.id }),
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
   * BÚSQUEDA
   * El texto se divide en palabras y cada una debe aparecer en el movimiento (concepto, notas,
   * categoría, método o tipo) o coincidir con su importe:
   *   "50"     → movimientos de 50,00 € a 50,99 €
   *   "12,50"  → solo los de 12,50 €
   *   "gasto"  → todos los gastos ("ingreso", los ingresos)
   *   "amazon 30" → movimientos de Amazon de 30 €
   * Las mayúsculas y las tildes dan igual.
   * ------------------------------------------------------------- */

  // Texto de búsqueda de cada movimiento, calculado una sola vez (se rehace si cambian las categorías)
  let searchCache = new WeakMap();
  let searchCategories = null;

  function searchText(t) {
    const categories = Categories.all();
    if (categories !== searchCategories) {
      searchCache = new WeakMap();
      searchCategories = categories;
    }
    let text = searchCache.get(t);
    if (text === undefined) {
      const type = t.type === 'income' ? 'ingreso ingresos' : 'gasto gastos';
      text = normalize(`${t.concept} ${t.notes} ${Categories.get(t.categoryId).name} ${t.method} ${type}`);
      searchCache.set(t, text);
    }
    return text;
  }

  /** Divide la búsqueda en palabras; las que son una cantidad guardan también su valor en céntimos */
  function parseQuery(text) {
    return normalize(text).split(/\s+/).filter(Boolean).map((word) => {
      const token = { word };
      if (/^\d[\d.,]*$/.test(word)) {
        const cents = Utils.toCents(word);
        if (!Number.isNaN(cents)) {
          token.cents = cents;
          token.wholeEuros = !/[.,]\d{1,2}$/.test(word); // sin decimales: vale cualquier céntimo
        }
      }
      return token;
    });
  }

  function matchesToken(t, token) {
    if (searchText(t).includes(token.word)) return true;
    if (token.cents === undefined) return false;
    return token.wholeEuros ? Math.floor(t.amount / 100) * 100 === token.cents : t.amount === token.cents;
  }

  /* ---------------------------------------------------------------
   * FILTROS Y ORDEN
   * ------------------------------------------------------------- */

  function applyFilters(list, filters) {
    const tokens = parseQuery(filters.text || '');
    return list.filter((t) => {
      if (filters.type && filters.type !== 'all' && t.type !== filters.type) return false;
      if (filters.categoryId && t.categoryId !== filters.categoryId) return false;
      if (filters.method && t.method !== filters.method) return false;
      if (filters.from && t.date < filters.from) return false;
      if (filters.to && t.date > filters.to) return false;
      return tokens.every((token) => matchesToken(t, token));
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

  /** Muestra en el historial solo los movimientos de una categoría (desde sus estadísticas) */
  function showCategory(categoryId) {
    const category = Categories.get(categoryId);
    state.filters = { text: '', type: category.type, categoryId, from: '', to: '', method: '' };
    state.visible = PAGE_SIZE;
    if (state.mounted) syncFilterInputs();
  }

  /* ---------------------------------------------------------------
   * FORMULARIO (modal)
   * ------------------------------------------------------------- */

  let editingId = null;
  let extraData = {}; // datos extra al guardar (p. ej. desde un gasto recurrente)
  let saving = false;

  /*
   * Recibo del formulario:
   *  - current: id del recibo que ya tenía el movimiento
   *  - pending: imagen nueva ya comprimida, pendiente de guardar al pulsar "Guardar"
   *  - removed: el usuario ha quitado el recibo que tenía
   * Nada se guarda hasta enviar el formulario: si se cancela, no queda ninguna imagen huérfana.
   */
  const receipt = { current: null, pending: null, removed: false, preview: '' };

  function resetReceipt(currentId = null) {
    receipt.current = currentId;
    receipt.pending = null;
    receipt.removed = false;
    receipt.preview = '';
    renderReceiptField();
    if (!currentId) return;
    Receipts.get(currentId).then((record) => {
      // El formulario puede haberse cerrado o cambiado mientras se leía la imagen
      if (receipt.current !== currentId || receipt.pending || receipt.removed) return;
      receipt.preview = record ? record.dataUrl : '';
      renderReceiptField(record ? '' : 'El recibo no está disponible en este navegador.');
    }).catch(() => renderReceiptField('No se ha podido leer el recibo.'));
  }

  function renderReceiptField(note = '') {
    const box = $('#tx-receipt-preview');
    const add = $('#tx-receipt-add');
    const hasReceipt = Boolean(receipt.pending || (receipt.current && !receipt.removed));
    box.hidden = !hasReceipt;
    add.querySelector('.receipt-add-text').textContent = hasReceipt ? 'Cambiar recibo' : 'Añadir recibo';
    if (!hasReceipt) return;
    const src = receipt.pending ? receipt.pending.dataUrl : receipt.preview;
    const img = $('#tx-receipt-img');
    img.hidden = !src;
    if (src) img.src = src;
    $('#tx-receipt-meta').textContent = note || (receipt.pending
      ? `Imagen nueva · ${Utils.formatBytes(Receipts.byteSize(receipt.pending.dataUrl))} (se guardará al pulsar "Guardar")`
      : 'Recibo guardado');
  }

  async function handleReceiptFile(input) {
    const file = input.files[0];
    input.value = ''; // permite volver a elegir la misma imagen
    if (!file) return;
    const form = $('#tx-form');
    const error = Validate.imageFile(file);
    if (error) {
      UI.showErrors(form, { receipt: error });
      return;
    }
    const add = $('#tx-receipt-add');
    add.classList.add('is-loading');
    add.querySelector('.receipt-add-text').textContent = 'Procesando imagen…';
    try {
      receipt.pending = await Receipts.compress(file);
      UI.clearErrors(form);
      renderReceiptField();
    } catch (err) {
      renderReceiptField();
      UI.showErrors(form, { receipt: err.message || 'No se ha podido leer la imagen.' });
    } finally {
      add.classList.remove('is-loading');
    }
  }

  function removeReceiptFromForm() {
    if (receipt.pending) receipt.pending = null;
    else receipt.removed = true;
    renderReceiptField();
  }

  /**
   * Guarda la imagen nueva (si la hay) y devuelve el id de recibo que tendrá el movimiento,
   * null si no tendrá recibo o false si no se ha podido guardar (el error ya se muestra en el formulario).
   */
  async function saveReceipt(form) {
    if (receipt.pending) {
      const id = Utils.uid('rcp');
      try {
        await Receipts.save({ id, ...receipt.pending, createdAt: Date.now() });
        return id;
      } catch (error) {
        console.error(error);
        UI.showErrors(form, { receipt: 'No se ha podido guardar el recibo: el almacenamiento del navegador está lleno. Quítalo o libera espacio para continuar.' });
        return false;
      }
    }
    return receipt.removed ? null : receipt.current;
  }

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
    // Al duplicar no se copia el recibo: pertenece a una compra concreta
    resetReceipt(id ? source.receiptId || null : null);

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

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    const form = event.target;
    const { values, errors } = validate(form);
    if (!UI.showErrors(form, errors)) return;

    // El recibo se guarda antes que el movimiento: si no cabe, el movimiento no se modifica
    saving = true;
    $('#tx-submit').disabled = true;
    try {
      const receiptId = await saveReceipt(form);
      if (receiptId === false) return;

      const label = TYPES[values.type];
      if (editingId) {
        update(editingId, { ...values, receiptId: receiptId || undefined });
        UI.toast(`${label} actualizado correctamente`);
      } else {
        add({ ...values, ...extraData, ...(receiptId ? { receiptId } : {}) });
        UI.toast(`${label} añadido correctamente`);
      }
      // El recibo anterior ya no se usa si se ha quitado o sustituido
      if (receipt.current && receipt.current !== receiptId) Receipts.remove(receipt.current).catch(() => {});
      receipt.current = receiptId;
      receipt.pending = null;
      UI.closeModal('tx-modal');
    } finally {
      saving = false;
      $('#tx-submit').disabled = false;
    }
  }

  function initForm() {
    const form = $('#tx-form');
    form.addEventListener('submit', handleSubmit);
    form.addEventListener('change', (event) => {
      if (event.target.name === 'type') {
        updateFormForType(event.target.value);
        if (!editingId) $('#tx-modal-title').textContent = event.target.value === 'expense' ? 'Nuevo gasto' : 'Nuevo ingreso';
      }
      if (event.target.name === 'receipt') handleReceiptFile(event.target);
    });
    $('#tx-receipt-remove').addEventListener('click', removeReceiptFromForm);
    $('#tx-receipt-img').addEventListener('click', () => {
      const src = $('#tx-receipt-img').src;
      if (src) Receipts.openViewer({ src, title: form.elements.concept.value.trim() || 'Recibo' });
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
        <button class="btn btn-expense" data-action="add-expense">${Icons.get('arrowDownRight', 18)}<span class="label-long">Añadir gasto</span><span class="label-short">Gasto</span></button>
        <button class="btn btn-income" data-action="add-income">${Icons.get('arrowUpRight', 18)}<span class="label-long">Añadir ingreso</span><span class="label-short">Ingreso</span></button>
        <button class="btn btn-ghost page-export" data-action="export-csv-filtered" title="Exporta los movimientos que coinciden con los filtros">${Icons.get('download', 18)}Exportar CSV</button>
        <button class="btn-icon page-more" data-action="tx-page-menu" aria-label="Más opciones">${Icons.get('more', 20)}</button>
      </div>

      <div class="card filters-card">
        <div class="filters-bar">
          <div class="filter-search">
            ${Icons.get('search', 18)}
            <label class="sr-only" for="filter-text">Buscar movimientos</label>
            <input type="search" id="filter-text" placeholder="Buscar por concepto, categoría, importe o tipo…" autocomplete="off">
          </div>
          <button class="btn btn-ghost btn-sm filters-toggle" id="filters-toggle" type="button" aria-expanded="false" aria-controls="filters-grid"></button>
          <button class="btn btn-link btn-sm" id="filter-clear" type="button">Limpiar filtros</button>
        </div>
        <div class="filters-grid" id="filters-grid">
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

      <div class="card summary-strip" id="tx-summary"></div>
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

  /** Número de filtros activos sin contar el texto de búsqueda */
  function activeFilterCount() {
    const f = state.filters;
    return [f.type !== 'all', f.categoryId, f.method, f.from, f.to].filter(Boolean).length;
  }

  function hasActiveFilters() {
    return Boolean(state.filters.text || activeFilterCount());
  }

  function sortHeader(field, label) {
    const active = state.sort.field === field;
    const icon = active ? (state.sort.dir === 'asc' ? 'chevronUp' : 'chevronDown') : 'sort';
    return `<button class="th-sort ${active ? 'is-active' : ''}" data-sort="${field}"
      aria-label="Ordenar por ${label}">${label}${Icons.get(icon, 14)}</button>`;
  }

  /** Botón con un clip para ver el recibo de un movimiento (si tiene) */
  function receiptButton(t) {
    if (!t.receiptId) return '';
    return `<button type="button" class="receipt-chip" data-action="view-receipt" data-id="${escapeHTML(t.id)}"
      title="Ver recibo" aria-label="Ver recibo de ${escapeHTML(t.concept)}">${Icons.get('paperclip', 13)}</button>`;
  }

  /** Fila de la tabla. En móvil (responsive.css) se convierte en una tarjeta de dos líneas */
  function rowHTML(t) {
    const category = Categories.get(t.categoryId);
    const sign = t.type === 'income' ? 1 : -1;
    const id = escapeHTML(t.id);
    const concept = escapeHTML(t.concept);
    // En la línea de detalle de móvil, las fechas del año en curso se muestran sin el año
    const shortDate = t.date.startsWith(String(new Date().getFullYear())) ? formatDate(t.date, 'dayMonth') : formatDate(t.date);
    return `
      <tr data-action="tx-row" data-id="${id}">
        <td data-label="Fecha" class="nowrap">${formatDate(t.date)}</td>
        <td data-label="Concepto" class="td-concept">
          <div class="concept-cell">
            ${UI.categoryBadge(category, 'sm')}
            <div>
              <strong>${concept}${receiptButton(t)}</strong>
              <small class="concept-meta"><span class="cat-dot" style="--cat-color:${category.color}"></span>${escapeHTML(category.name)} · ${shortDate} · ${escapeHTML(t.method || '—')}</small>
              ${t.notes ? `<small class="concept-notes">${escapeHTML(t.notes)}</small>` : ''}
            </div>
          </div>
        </td>
        <td data-label="Categoría">${UI.categoryChip(category)}</td>
        <td data-label="Tipo"><span class="pill pill-${t.type}">${TYPES[t.type]}</span></td>
        <td data-label="Método">${escapeHTML(t.method || '—')}</td>
        <td data-label="Cantidad" class="td-amount amount-${t.type}">${formatMoney(sign * t.amount, { sign: true })}</td>
        <td data-label="Acciones" class="td-actions">
          <button class="btn-icon btn-icon-sm" data-action="edit-tx" data-id="${id}" title="Editar" aria-label="Editar ${concept}">${Icons.get('edit', 16)}</button>
          <button class="btn-icon btn-icon-sm" data-action="duplicate-tx" data-id="${id}" title="Duplicar con fecha de hoy" aria-label="Duplicar ${concept} con fecha de hoy">${Icons.get('copy', 16)}</button>
          <button class="btn-icon btn-icon-sm btn-icon-danger" data-action="delete-tx" data-id="${id}" title="Eliminar" aria-label="Eliminar ${concept}">${Icons.get('trash', 16)}</button>
          <button class="btn-icon btn-icon-sm row-menu" data-action="tx-menu" data-id="${id}" aria-label="Acciones de ${concept}">${Icons.get('more', 18)}</button>
        </td>
      </tr>`;
  }

  /** Menú de acciones de un movimiento (en móvil sustituye a los tres botones de la fila) */
  function openRowMenu(id) {
    const t = get(id);
    if (!t) return;
    const sign = t.type === 'income' ? 1 : -1;
    UI.actionSheet({
      title: t.concept,
      subtitle: `${formatMoney(sign * t.amount, { sign: true })} · ${formatDate(t.date)} · ${t.method || '—'}`,
      media: UI.categoryBadge(Categories.get(t.categoryId)),
      items: [
        { label: 'Editar', icon: 'edit', action: 'edit-tx', id },
        { label: 'Duplicar con fecha de hoy', icon: 'copy', action: 'duplicate-tx', id },
        ...(t.receiptId ? [{ label: 'Ver recibo', icon: 'paperclip', action: 'view-receipt', id }] : []),
        { label: 'Eliminar', icon: 'trash', action: 'delete-tx', id, danger: true },
      ],
    });
  }

  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

  function renderResults() {
    const list = filtered();
    const income = Utils.sumBy(list.filter((t) => t.type === 'income'), (t) => t.amount);
    const expense = Utils.sumBy(list.filter((t) => t.type === 'expense'), (t) => t.amount);

    $('#tx-summary').innerHTML = `
      <div class="summary-item"><span>Movimientos</span><strong>${list.length}</strong></div>
      <div class="summary-item"><span>Ingresos</span><strong class="amount-income">${UI.money(income)}</strong></div>
      <div class="summary-item"><span>Gastos</span><strong>${UI.money(expense)}</strong></div>
      <div class="summary-item"><span>Balance</span><strong>${UI.money(income - expense, { sign: true })}</strong></div>`;

    $('#filter-clear').disabled = !hasActiveFilters();
    const count = activeFilterCount();
    $('#filters-toggle').innerHTML = `${Icons.get('filter', 16)}Filtros${count ? `<span class="count-badge">${count}</span>` : ''}`;
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
    'duplicate-tx': (id) => duplicate(id),
    'delete-tx': (id) => remove(id),
    'view-receipt': (id) => Receipts.view(id),
    'clear-filters': () => { setSearch(''); renderResults(); },
    'tx-menu': (id) => openRowMenu(id),
    // En móvil, tocar una fila abre su menú de acciones; en escritorio no hace nada (hay botones)
    'tx-row': (id) => { if (isMobile()) openRowMenu(id); },
    'tx-page-menu': () => UI.actionSheet({
      title: 'Movimientos',
      subtitle: 'Se exportan los movimientos que coinciden con los filtros',
      items: [{ label: 'Exportar CSV', icon: 'download', action: 'export-csv-filtered' }],
    }),
    'export-csv-filtered': () => exportCSV(filtered(), `mybudget-movimientos-${Utils.todayISO()}.csv`),
    'export-csv-all': () => exportCSV(all(), `mybudget-movimientos-${Utils.todayISO()}.csv`),
  };

  function init() {
    initForm();
  }

  return {
    TYPES, METHODS, all, get, forMonth, recent, between, monthKeys, add, update, remove, duplicate,
    duplicateData, openForm, setSearch, showCategory, render, rowHTML, actions, init, applyFilters,
    parseQuery, exportCSV,
  };
})();
