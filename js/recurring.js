/**
 * recurring.js
 * Gastos recurrentes (suscripciones, alquiler, seguros…).
 * No se cobran solos: la app calcula y muestra los próximos pagos, y el usuario
 * puede registrarlos como gasto con un clic.
 */
const Recurring = (() => {
  const { $, escapeHTML, formatMoney, addMonths, monthDiff, daysInMonth, todayISO } = Utils;

  const FREQUENCIES = {
    monthly: { label: 'Mensual', months: 1 },
    bimonthly: { label: 'Bimestral', months: 2 },
    quarterly: { label: 'Trimestral', months: 3 },
    semiannual: { label: 'Semestral', months: 6 },
    yearly: { label: 'Anual', months: 12 },
  };

  function all() {
    return Store.get('recurring') || [];
  }

  function get(id) {
    return all().find((r) => r.id === id);
  }

  function save(data, id = null) {
    if (id) {
      Store.set('recurring', all().map((r) => (r.id === id ? { ...r, ...data, demo: undefined } : r)));
    } else {
      Store.set('recurring', [...all(), { id: Utils.uid('rec'), active: true, ...data }]);
    }
  }

  async function remove(id) {
    const item = get(id);
    const ok = await UI.confirm({
      title: 'Eliminar gasto recurrente',
      message: `Se eliminará "${item.name}". Los gastos ya registrados no se borran.`,
    });
    if (!ok) return;
    Store.set('recurring', all().filter((r) => r.id !== id));
    UI.toast(`"${item.name}" eliminado`, 'info');
  }

  function toggle(id) {
    const item = get(id);
    Store.set('recurring', all().map((r) => (r.id === id ? { ...r, active: !r.active } : r)));
    UI.toast(item.active ? `"${item.name}" pausado` : `"${item.name}" reactivado`, 'info');
  }

  /* ---------------------------------------------------------------
   * CÁLCULO DE FECHAS
   * ------------------------------------------------------------- */

  /** Fecha del cargo en un mes (si el día no existe se usa el último día del mes) */
  function dateInMonth(key, day) {
    return `${key}-${String(Math.min(day, daysInMonth(key))).padStart(2, '0')}`;
  }

  /** Todas las fechas de cobro entre "from" y "to" (ISO, ambas incluidas) */
  function occurrences(item, from, to) {
    const step = FREQUENCIES[item.frequency].months;
    let key = item.startMonth;
    const diff = monthDiff(key, from.slice(0, 7));
    if (diff > 0) key = addMonths(key, Math.floor(diff / step) * step);

    const dates = [];
    let date = dateInMonth(key, item.day);
    while (date <= to) {
      if (date >= from) dates.push(date);
      key = addMonths(key, step);
      date = dateInMonth(key, item.day);
    }
    return dates;
  }

  /** Próximo cobro a partir de hoy */
  function nextDate(item) {
    const today = todayISO();
    const limit = Utils.toISODate(new Date(new Date().getFullYear() + 2, 0, 1));
    return occurrences(item, today, limit)[0] || null;
  }

  /** Próximos pagos de todos los recurrentes activos en los próximos "days" días */
  function upcoming(days = 30) {
    const from = todayISO();
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + days);
    const to = Utils.toISODate(toDate);
    return all()
      .filter((r) => r.active)
      .flatMap((r) => occurrences(r, from, to).map((date) => ({ item: r, date })))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Cobros de un mes concreto */
  function forMonth(key) {
    const from = `${key}-01`;
    const to = `${key}-${daysInMonth(key)}`;
    return all()
      .filter((r) => r.active)
      .flatMap((r) => occurrences(r, from, to).map((date) => ({ item: r, date })))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Coste mensual equivalente (un seguro anual de 120 € = 10 €/mes) */
  function monthlyEquivalent(item) {
    return Math.round(item.amount / FREQUENCIES[item.frequency].months);
  }

  /* ---------------------------------------------------------------
   * FORMULARIO
   * ------------------------------------------------------------- */

  let editingId = null;

  function openForm(id = null) {
    const form = $('#recurring-form');
    form.reset();
    editingId = id;
    const item = id ? get(id) : null;

    UI.fillSelect(form.elements.categoryId, Categories.options('expense'), {
      placeholder: 'Selecciona una categoría', selected: item?.categoryId || 'exp-suscripciones',
    });
    UI.fillSelect(form.elements.frequency,
      Object.entries(FREQUENCIES).map(([value, f]) => ({ value, label: f.label })),
      { selected: item?.frequency || 'monthly' });
    UI.fillSelect(form.elements.method, Transactions.METHODS.expense.map((m) => ({ value: m, label: m })), {
      placeholder: 'Selecciona un método', selected: item?.method || 'Domiciliación',
    });
    form.elements.name.value = item?.name || '';
    form.elements.amount.value = item ? Utils.centsToInput(item.amount) : '';
    form.elements.day.value = item?.day || '';
    form.elements.startMonth.value = item?.startMonth || Utils.currentMonthKey();

    $('#recurring-modal-title').textContent = item ? 'Editar gasto recurrente' : 'Nuevo gasto recurrente';
    UI.openModal('recurring-modal');
  }

  function handleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const values = {
      name: form.elements.name.value.trim(),
      categoryId: form.elements.categoryId.value,
      day: Number(form.elements.day.value),
      frequency: form.elements.frequency.value,
      startMonth: form.elements.startMonth.value.trim(),
      method: form.elements.method.value,
    };
    const errors = {};
    if (!values.name) errors.name = 'El nombre es obligatorio.';
    const amount = UI.validateAmount(form.elements.amount.value);
    if (amount.error) errors.amount = amount.error;
    if (!values.categoryId || !Categories.exists(values.categoryId, 'expense')) errors.categoryId = 'Selecciona una categoría.';
    if (!form.elements.day.value) errors.day = 'El día es obligatorio.';
    else if (!Number.isInteger(values.day) || values.day < 1 || values.day > 31) errors.day = 'Introduce un día entre 1 y 31.';
    if (!FREQUENCIES[values.frequency]) errors.frequency = 'Selecciona una frecuencia.';
    if (!Utils.isValidMonthKey(values.startMonth)) errors.startMonth = 'Introduce un mes válido (AAAA-MM).';
    if (!values.method) errors.method = 'Selecciona un método de pago.';
    if (!UI.showErrors(form, errors)) return;

    save({ ...values, amount: amount.cents }, editingId);
    UI.closeModal('recurring-modal');
    UI.toast(editingId ? 'Gasto recurrente actualizado' : `"${values.name}" añadido a recurrentes`);
  }

  /** Abre el formulario de gasto con los datos del recurrente para registrar el pago */
  function registerPayment(id) {
    const item = get(id);
    Transactions.openForm({
      prefill: {
        type: 'expense',
        concept: item.name,
        amount: item.amount,
        categoryId: item.categoryId,
        method: item.method,
        notes: `Pago recurrente (${FREQUENCIES[item.frequency].label.toLowerCase()})`,
        recurringId: item.id,
      },
    });
  }

  /* ---------------------------------------------------------------
   * VISTA
   * ------------------------------------------------------------- */

  /** Elemento de "próximo pago" (reutilizado en el dashboard) */
  function upcomingItemHTML({ item, date }) {
    const category = Categories.get(item.categoryId);
    const days = Utils.daysUntil(date);
    return `
      <li class="upcoming-item">
        ${UI.dateTile(date)}
        <div class="grow">
          <strong>${escapeHTML(item.name)}</strong>
          <small>${escapeHTML(category.icon)} ${escapeHTML(category.name)} · <span class="${days <= 3 ? 'text-warn' : ''}">${Utils.relativeDays(date)}</span></small>
        </div>
        <strong class="upcoming-amount">${formatMoney(item.amount)}</strong>
      </li>`;
  }

  function itemCardHTML(item, next) {
    const category = Categories.get(item.categoryId);
    const freq = FREQUENCIES[item.frequency];
    const id = escapeHTML(item.id);
    const name = escapeHTML(item.name);
    return `
      <article class="card recurring-card ${item.active ? '' : 'is-paused'}">
        <header class="recurring-header">
          ${UI.categoryBadge(category)}
          <div class="grow">
            <h3>${name}</h3>
            <span class="muted">${escapeHTML(category.name)} · ${escapeHTML(item.method || '—')}</span>
          </div>
          <span class="pill ${item.active ? 'pill-income' : 'pill-muted'}">${item.active ? 'Activo' : 'Pausado'}</span>
        </header>
        <div class="recurring-body">
          <div class="recurring-amount">
            <strong>${UI.money(item.amount)}</strong>
            <span class="muted">${freq.label} · día ${item.day}</span>
          </div>
          ${next
            ? `<div class="recurring-next">${UI.dateTile(next)}<span class="recurring-next-text"><small>Próximo pago</small>${Utils.relativeDays(next)}</span></div>`
            : '<div class="recurring-next"><span class="recurring-next-text"><small>Próximo pago</small>En pausa</span></div>'}
        </div>
        <footer class="card-footer-actions">
          <button class="btn btn-ghost btn-sm" data-action="pay-recurring" data-id="${id}">${Icons.get('receipt', 16)}Registrar pago</button>
          <div class="card-actions">
            <button class="btn-icon btn-icon-sm" data-action="toggle-recurring" data-id="${id}" title="${item.active ? 'Pausar' : 'Reactivar'}" aria-label="${item.active ? 'Pausar' : 'Reactivar'} ${name}">${Icons.get(item.active ? 'pause' : 'play', 16)}</button>
            <button class="btn-icon btn-icon-sm" data-action="edit-recurring" data-id="${id}" title="Editar" aria-label="Editar ${name}">${Icons.get('edit', 16)}</button>
            <button class="btn-icon btn-icon-sm btn-icon-danger" data-action="delete-recurring" data-id="${id}" title="Eliminar" aria-label="Eliminar ${name}">${Icons.get('trash', 16)}</button>
          </div>
        </footer>
      </article>`;
  }

  function render(key) {
    const view = $('#view-recurrentes');
    const items = all();
    const active = items.filter((r) => r.active);
    const monthlyTotal = Utils.sumBy(active, monthlyEquivalent);
    const thisMonth = forMonth(key);
    const next = upcoming(30);

    if (!items.length) {
      view.innerHTML = `<div class="card">${UI.emptyState({
        icon: 'repeat', title: 'No tienes gastos recurrentes',
        text: 'Añade suscripciones, alquiler, seguros o cualquier pago periódico para verlos de un vistazo.',
        action: '<button class="btn btn-primary" data-action="add-recurring">Añadir recurrente</button>',
      })}</div>`;
      return;
    }

    // La próxima fecha de cada recurrente se calcula una sola vez (no en cada comparación del sort)
    const cards = items
      .map((item) => ({ item, next: item.active ? nextDate(item) : null }))
      .sort((a, b) => (b.item.active - a.item.active) || (a.next || '').localeCompare(b.next || ''));

    view.innerHTML = `
      <div class="kpi-grid kpi-grid-4">
        ${UI.kpi({ label: 'Coste mensual', value: UI.money(monthlyTotal), icon: 'repeat', foot: '<span class="muted">Equivalente al mes</span>' })}
        ${UI.kpi({ label: 'Coste anual', value: UI.money(monthlyTotal * 12), icon: 'calendar', foot: '<span class="muted">Estimación a 12 meses</span>' })}
        ${UI.kpi({ label: `Cargos en ${Utils.monthLabel(key).split(' ')[0].toLowerCase()}`, value: UI.money(Utils.sumBy(thisMonth, (o) => o.item.amount)), icon: 'receipt', foot: `<span class="muted">${thisMonth.length} pago(s)</span>` })}
        ${UI.kpi({ label: 'Activos', value: `${active.length}<span class="kpi-value-minor"> / ${items.length}</span>`, icon: 'play', foot: '<span class="muted">Gastos recurrentes</span>' })}
      </div>

      <div class="grid grid-2-1">
        <div class="stack">
          <div class="section-header">
            <h2>Tus gastos recurrentes</h2>
            <button class="btn btn-primary" data-action="add-recurring">${Icons.get('plus', 18)}Añadir</button>
          </div>
          <div class="recurring-grid">${cards.map((c) => itemCardHTML(c.item, c.next)).join('')}</div>
        </div>
        <aside class="card sticky-card">
          <h2 class="card-title">${Icons.get('clock', 18)}Próximos 30 días</h2>
          ${next.length
            ? `<ul class="upcoming-list">${next.map(upcomingItemHTML).join('')}</ul>
               <div class="card-total"><span>Total próximos 30 días</span><strong>${formatMoney(Utils.sumBy(next, (o) => o.item.amount))}</strong></div>`
            : '<p class="muted">No hay pagos en los próximos 30 días.</p>'}
        </aside>
      </div>`;
  }

  const actions = {
    'add-recurring': () => openForm(),
    'edit-recurring': (id) => openForm(id),
    'delete-recurring': (id) => remove(id),
    'toggle-recurring': (id) => toggle(id),
    'pay-recurring': (id) => registerPayment(id),
  };

  function init() {
    const form = $('#recurring-form');
    form.addEventListener('submit', handleSubmit);
    UI.liveClearErrors(form);
  }

  return { FREQUENCIES, all, occurrences, upcoming, forMonth, monthlyEquivalent, upcomingItemHTML, render, actions, init };
})();
