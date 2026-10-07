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

  /**
   * Cobros de los recurrentes activos entre dos fechas, indicando si ya se han pagado
   * (ver Finance.matchRecurring). Se miran los gastos de los meses completos: un pago registrado
   * el día 14 cubre el cobro del día 15 del mismo mes.
   * → { list: [{ item, date, paid }], matchedExpenses: gastos que corresponden a algún cobro }
   */
  function schedule(from, to) {
    const list = all()
      .filter((r) => r.active)
      .flatMap((r) => occurrences(r, from, to).map((date) => ({ item: r, date })))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!list.length) return { list: [], matchedExpenses: [] };
    const expenses = Transactions.between(`${from.slice(0, 7)}-01`, Utils.monthEnd(to.slice(0, 7)))
      .filter((t) => t.type === 'expense');
    const { paid, matched } = Finance.matchRecurring(list, expenses);
    return {
      list: list.map((o) => ({ ...o, paid: paid.has(`${o.item.id}|${o.date}`) })),
      matchedExpenses: expenses.filter((t) => matched.has(t.id)),
    };
  }

  /** Próximos pagos (aún sin registrar) de los recurrentes activos en los próximos "days" días */
  function upcoming(days = 30) {
    const from = todayISO();
    return schedule(from, Utils.addDays(from, days)).list.filter((o) => !o.paid);
  }

  /**
   * Pagos pendientes desde hoy hasta el horizonte elegido en Configuración ("dinero disponible"):
   * "month" = hasta final de mes, "7" / "30" = próximos días, "off" = no se descuenta nada.
   */
  function pending(horizon = 'month') {
    if (horizon === 'off') return { list: [], until: null };
    const from = todayISO();
    const until = horizon === 'month' ? Utils.monthEnd(Utils.currentMonthKey()) : Utils.addDays(from, Number(horizon) || 30);
    return { list: schedule(from, until).list.filter((o) => !o.paid), until };
  }

  /**
   * Cobros de un mes separados en pagados y pendientes, y cuánto suman.
   * fixedSpent (gastos del mes que son pagos recurrentes) y pendingFixed (lo que falta por cobrar
   * desde hoy) se usan en la previsión del presupuesto.
   */
  function monthBreakdown(key) {
    const today = todayISO();
    const { list, matchedExpenses } = schedule(`${key}-01`, Utils.monthEnd(key));
    const pendingList = list.filter((o) => !o.paid && o.date >= today);
    return {
      list,
      paid: list.filter((o) => o.paid),
      pending: pendingList,
      overdue: list.filter((o) => !o.paid && o.date < today),
      fixedSpent: Utils.sumBy(matchedExpenses, (t) => t.amount),
      pendingFixed: Utils.sumBy(pendingList, (o) => o.item.amount),
    };
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

  /** "Hoy", "Mañana", "en 5 días" */
  function inDays(date) {
    const days = Utils.daysUntil(date);
    if (days <= 1) return Utils.relativeDays(date);
    return `en ${days} días`;
  }

  /** Elemento de "próximo pago" (reutilizado en el dashboard) */
  function upcomingItemHTML({ item, date }) {
    const category = Categories.get(item.categoryId);
    const days = Utils.daysUntil(date);
    return `
      <li class="upcoming-item">
        ${UI.dateTile(date)}
        <div class="grow">
          <strong>${escapeHTML(item.name)}</strong>
          <small>${escapeHTML(category.icon)} ${escapeHTML(category.name)} · ${FREQUENCIES[item.frequency].label.toLowerCase()}</small>
        </div>
        <span class="upcoming-side">
          <strong class="upcoming-amount">${formatMoney(item.amount)}</strong>
          <small class="upcoming-when ${days <= 3 ? 'text-warn' : ''}">${inDays(date)}</small>
        </span>
      </li>`;
  }

  /**
   * Tarjeta de un recurrente. "info" = { next, paidThisMonth, overdue } calculado en render():
   * próximo cobro sin pagar, si el cobro de este mes ya está registrado y si hay uno pasado sin registrar.
   */
  function itemCardHTML(item, info) {
    const { next, paidThisMonth, overdue } = info;
    const category = Categories.get(item.categoryId);
    const freq = FREQUENCIES[item.frequency];
    const id = escapeHTML(item.id);
    const name = escapeHTML(item.name);
    const days = next ? Utils.daysUntil(next) : null;
    let status = '';
    if (item.active && paidThisMonth) {
      status = `<p class="recurring-status is-paid">${Icons.get('check', 14)}Pago de ${Utils.monthLabel(Utils.currentMonthKey()).split(' ')[0].toLowerCase()} registrado</p>`;
    } else if (item.active && overdue) {
      status = `<p class="recurring-status">${Icons.get('info', 14)}Pago del ${Utils.formatDate(overdue, 'dayMonth')} sin registrar</p>`;
    }
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
            ? `<div class="recurring-next">${UI.dateTile(next)}<span class="recurring-next-text"><small>Próximo pago</small><span class="${days <= 3 ? 'text-warn' : ''}">${Utils.capitalize(inDays(next))}</span></span></div>`
            : '<div class="recurring-next"><span class="recurring-next-text"><small>Próximo pago</small>En pausa</span></div>'}
        </div>
        ${status}
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
    const thisMonth = monthBreakdown(key);
    const next = upcoming(30);

    if (!items.length) {
      view.innerHTML = `<div class="card">${UI.emptyState({
        icon: 'repeat', title: 'No tienes gastos recurrentes',
        text: 'Añade suscripciones, alquiler, seguros o cualquier pago periódico para verlos de un vistazo.',
        action: '<button class="btn btn-primary" data-action="add-recurring">Añadir recurrente</button>',
      })}</div>`;
      return;
    }

    // Cobros desde el día 1 de este mes: se calculan una sola vez para todas las tarjetas
    const today = todayISO();
    const currentKey = Utils.currentMonthKey();
    const horizon = schedule(`${currentKey}-01`, Utils.addDays(today, 400)).list;
    const infoFor = (item) => {
      const own = horizon.filter((o) => o.item.id === item.id);
      const current = own.filter((o) => o.date.startsWith(currentKey));
      return {
        next: item.active ? (own.find((o) => o.date >= today && !o.paid) || {}).date || null : null,
        paidThisMonth: current.length > 0 && current.every((o) => o.paid),
        overdue: (current.find((o) => !o.paid && o.date < today) || {}).date || null,
      };
    };
    const cards = items
      .map((item) => ({ item, info: infoFor(item) }))
      .sort((a, b) => (b.item.active - a.item.active) || (a.info.next || '').localeCompare(b.info.next || ''));

    const monthName = Utils.monthLabel(key).split(' ')[0].toLowerCase();
    const chargesFoot = thisMonth.list.length
      ? `<span class="muted">${thisMonth.paid.length} pagado(s) · ${thisMonth.list.length - thisMonth.paid.length} sin registrar</span>`
      : '<span class="muted">Sin cargos este mes</span>';

    view.innerHTML = `
      <div class="kpi-grid kpi-grid-4">
        ${UI.kpi({ label: 'Coste mensual', value: UI.money(monthlyTotal), icon: 'repeat', foot: '<span class="muted">Equivalente al mes</span>' })}
        ${UI.kpi({ label: 'Coste anual', value: UI.money(monthlyTotal * 12), icon: 'calendar', foot: '<span class="muted">Estimación a 12 meses</span>' })}
        ${UI.kpi({ label: `Cargos en ${monthName}`, value: UI.money(Utils.sumBy(thisMonth.list, (o) => o.item.amount)), icon: 'receipt', foot: chargesFoot })}
        ${UI.kpi({ label: 'Activos', value: `${active.length}<span class="kpi-value-minor"> / ${items.length}</span>`, icon: 'play', foot: '<span class="muted">Gastos recurrentes</span>' })}
      </div>

      <div class="grid grid-2-1">
        <div class="stack">
          <div class="section-header">
            <h2>Tus gastos recurrentes</h2>
            <button class="btn btn-primary" data-action="add-recurring">${Icons.get('plus', 18)}Añadir</button>
          </div>
          <div class="recurring-grid">${cards.map((c) => itemCardHTML(c.item, c.info)).join('')}</div>
        </div>
        <aside class="card sticky-card">
          <h2 class="card-title">${Icons.get('clock', 18)}Próximos 30 días</h2>
          ${next.length
            ? `<ul class="upcoming-list">${next.map(upcomingItemHTML).join('')}</ul>
               <div class="card-total"><span>Total próximos 30 días</span><strong>${formatMoney(Utils.sumBy(next, (o) => o.item.amount))}</strong></div>`
            : '<p class="muted">No hay pagos pendientes en los próximos 30 días.</p>'}
          <p class="hint">${Icons.get('info', 14)}<span>Los pagos ya registrados (con "Registrar pago" o un gasto de la misma categoría e importe en ese mes) no aparecen como pendientes.</span></p>
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

  return {
    FREQUENCIES, all, get, occurrences, schedule, upcoming, pending, monthBreakdown,
    monthlyEquivalent, inDays, upcomingItemHTML, render, actions, init,
  };
})();
