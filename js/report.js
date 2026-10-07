/**
 * report.js
 * Vista "Informe": informe mensual imprimible del mes elegido en el selector de mes.
 * Se exporta a PDF con el diálogo de impresión del navegador ("Guardar como PDF"): no hace falta
 * ninguna librería y funciona sin conexión. Los estilos de impresión están al final de style.css.
 */
const Report = (() => {
  const { $, escapeHTML, formatMoney, formatPercent, formatDate, monthLabel } = Utils;

  let currentKey = null;

  const BUDGET_STATUS = { ok: 'En control', warn: 'Cerca del límite', over: 'Superado' };
  const GOAL_STATUS = {
    completed: 'Completado', 'on-track': 'Al día', behind: 'Por detrás', overdue: 'Plazo vencido', 'no-deadline': 'Sin fecha',
  };
  const ALERT_LEVEL = { over: 'Superado', warn: 'Atención', info: 'Recordatorio', good: 'Bien' };
  const INSIGHT_TONE = { good: 'Bien', bad: 'A vigilar', neutral: 'Dato' };

  function kpi(label, value, detail = '') {
    return `<div class="report-kpi"><span>${label}</span><strong>${value}</strong>${detail ? `<small>${detail}</small>` : ''}</div>`;
  }

  function section(title, body) {
    return `<section class="report-section"><h3>${title}</h3>${body}</section>`;
  }

  /** Diferencia en texto con signo y flecha (el informe se imprime: no se puede depender del color) */
  function diffText(metric) {
    if (metric.diff === null || metric.diff === undefined) return '—';
    if (Math.abs(metric.diff) < (metric.kind === 'points' ? 0.05 : 1)) return '= Igual';
    const arrow = metric.diff > 0 ? '▲' : '▼';
    if (metric.kind === 'points') return `${arrow} ${Math.abs(metric.diff).toFixed(1).replace('.', ',')} pts`;
    const amount = metric.kind === 'count' ? `${metric.diff > 0 ? '+' : '−'}${Math.abs(metric.diff)}` : formatMoney(metric.diff, { sign: true });
    return `${arrow} ${amount}${metric.pct === null ? '' : ` (${formatPercent(Math.abs(metric.pct))})`}`;
  }

  function valueText(metric, value) {
    if (value === null || value === undefined) return '—';
    if (metric.kind === 'points') return formatPercent(value);
    if (metric.kind === 'count') return String(value);
    return formatMoney(value);
  }

  function comparisonHTML(key) {
    const prevKey = Utils.addMonths(key, -1);
    const data = Stats.compareMonths(prevKey, key);
    return `
      <table class="table report-table">
        <caption class="sr-only">Comparación de ${monthLabel(key)} con ${monthLabel(prevKey)}</caption>
        <thead><tr><th scope="col">Concepto</th><th scope="col" class="th-amount">${monthLabel(prevKey)}</th><th scope="col" class="th-amount">${monthLabel(key)}</th><th scope="col" class="th-amount">Diferencia</th></tr></thead>
        <tbody>${data.metrics.map((m) => `
          <tr>
            <td>${m.label}</td>
            <td class="td-amount">${valueText(m, m.a)}</td>
            <td class="td-amount">${valueText(m, m.b)}</td>
            <td class="td-amount">${diffText(m)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function categoriesHTML(key) {
    const items = Stats.categoriesForMonth(key).slice(0, 8);
    if (!items.length) return '<p class="muted">No hay gastos en este mes.</p>';
    return `
      <table class="table report-table">
        <caption class="sr-only">Categorías con mayor gasto</caption>
        <thead><tr><th scope="col">Categoría</th><th scope="col" class="th-amount">Importe</th><th scope="col" class="th-amount">% del gasto</th><th scope="col" class="report-bar-col"><span class="sr-only">Peso</span></th></tr></thead>
        <tbody>${items.map((c) => `
          <tr>
            <td>${escapeHTML(c.category.icon)} ${escapeHTML(c.category.name)}</td>
            <td class="td-amount">${formatMoney(c.total)}</td>
            <td class="td-amount">${formatPercent(c.pct)}</td>
            <td class="report-bar-col"><span class="report-bar"><span style="width:${c.pct.toFixed(1)}%;background:${c.category.color}"></span></span></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function budgetsHTML(key) {
    const monthly = Budget.monthlyStatus(key);
    const statuses = Budget.categoryStatuses(key);
    const plan = Budget.plan(key);
    if (!monthly.limit && !statuses.length) return '<p class="muted">No hay presupuestos definidos.</p>';
    const rows = [
      ...(monthly.limit ? [{ name: 'Presupuesto mensual', ...monthly }] : []),
      ...statuses.map((s) => ({ name: `${s.category.icon} ${s.category.name}`, ...s })),
    ];
    return `
      <table class="table report-table">
        <caption class="sr-only">Presupuestos del mes</caption>
        <thead><tr><th scope="col">Presupuesto</th><th scope="col" class="th-amount">Límite</th><th scope="col" class="th-amount">Gastado</th><th scope="col" class="th-amount">Restante</th><th scope="col" class="th-amount">Uso</th><th scope="col">Estado</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td>${escapeHTML(r.name)}</td>
            <td class="td-amount">${formatMoney(r.limit)}</td>
            <td class="td-amount">${formatMoney(r.spent)}</td>
            <td class="td-amount ${r.available < 0 ? 'amount-negative' : ''}">${formatMoney(r.available)}</td>
            <td class="td-amount">${formatPercent(r.pct, 0)}</td>
            <td><span class="status-pill status-${r.level}">${BUDGET_STATUS[r.level]}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${plan ? `<p class="report-note">Quedan ${plan.daysLeft} días: gasto recomendado de ${formatMoney(plan.recommendedDaily)} al día. Al ritmo actual el mes terminará con unos ${formatMoney(plan.projected)} gastados.</p>` : ''}`;
  }

  function goalsHTML() {
    const goals = Goals.all();
    if (!goals.length) return '<p class="muted">No hay objetivos de ahorro.</p>';
    return `
      <table class="table report-table">
        <caption class="sr-only">Objetivos de ahorro</caption>
        <thead><tr><th scope="col">Objetivo</th><th scope="col" class="th-amount">Ahorrado</th><th scope="col" class="th-amount">Meta</th><th scope="col" class="th-amount">Progreso</th><th scope="col">Fecha</th><th scope="col" class="th-amount">Necesario</th><th scope="col">Estado</th></tr></thead>
        <tbody>${goals.map((g) => {
          const p = Goals.progress(g);
          return `
            <tr>
              <td>${escapeHTML(g.icon)} ${escapeHTML(g.name)}</td>
              <td class="td-amount">${formatMoney(g.saved)}</td>
              <td class="td-amount">${formatMoney(g.target)}</td>
              <td class="td-amount">${formatPercent(p.pct)}</td>
              <td>${g.deadline ? Goals.deadlineLabel(g) : '—'}</td>
              <td class="td-amount">${p.monthlyNeeded ? `${formatMoney(p.monthlyNeeded)}/mes` : '—'}</td>
              <td>${GOAL_STATUS[p.status]}</td>
            </tr>`;
        }).join('')}
        </tbody>
      </table>`;
  }

  function recurringHTML(key) {
    const { list } = Recurring.monthBreakdown(key);
    if (!list.length) return '<p class="muted">No hay pagos recurrentes este mes.</p>';
    return `
      <table class="table report-table">
        <caption class="sr-only">Pagos recurrentes del mes</caption>
        <thead><tr><th scope="col">Pago</th><th scope="col">Fecha</th><th scope="col" class="th-amount">Importe</th><th scope="col">Estado</th></tr></thead>
        <tbody>${list.map((o) => `
          <tr>
            <td>${escapeHTML(o.item.name)}</td>
            <td>${formatDate(o.date)}</td>
            <td class="td-amount">${formatMoney(o.item.amount)}</td>
            <td>${o.paid ? '✓ Registrado' : (o.date < Utils.todayISO() ? 'Sin registrar' : 'Pendiente')}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function notesHTML(key) {
    const alerts = Alerts.forMonth(key);
    const insights = Insights.withoutAlertTopics(Insights.forMonth(key), alerts);
    if (!alerts.length && !insights.length) return '<p class="muted">No hay avisos ni consejos para este mes.</p>';
    return `
      <ul class="report-notes">
        ${alerts.map((a) => `<li class="report-note-${a.level}"><strong>${ALERT_LEVEL[a.level]}:</strong> ${escapeHTML(a.message)}</li>`).join('')}
        ${insights.map((i) => `<li class="report-note-${i.tone}"><strong>${INSIGHT_TONE[i.tone]}:</strong> ${escapeHTML(i.text)}</li>`).join('')}
      </ul>`;
  }

  function render(key) {
    currentKey = key;
    const view = $('#view-informe');
    const s = Stats.monthStats(key);
    const isCurrent = key === Utils.currentMonthKey();
    const isFuture = key > Utils.currentMonthKey();
    const horizon = Store.get('settings').availableHorizon;
    const pending = Recurring.pending(horizon);
    const money = Finance.availableMoney(Stats.balance(), pending.list.map((o) => o.item.amount));
    const name = Store.get('settings').userName;

    view.innerHTML = `
      <div class="page-actions report-actions">
        <button class="btn btn-ghost" data-action="report-csv">${Icons.get('download', 18)}<span class="label-long">Movimientos del mes (CSV)</span><span class="label-short">CSV</span></button>
        <button class="btn btn-primary" data-action="print-report">${Icons.get('printer', 18)}<span class="label-long">Imprimir o guardar PDF</span><span class="label-short">PDF</span></button>
      </div>

      <article class="card report" aria-labelledby="report-title">
        <header class="report-header">
          <img src="assets/icons/logo.svg" alt="" width="42" height="42">
          <div class="grow">
            <p class="report-kicker">MyBudget · Informe mensual${name ? ` de ${escapeHTML(name)}` : ''}</p>
            <h2 id="report-title">${monthLabel(key)}</h2>
            <p class="muted">Generado el ${formatDate(Utils.todayISO(), 'long').toLowerCase()}${isCurrent ? ' · mes en curso: datos hasta hoy' : ''}${isFuture ? ' · el mes aún no ha empezado' : ''}</p>
          </div>
        </header>

        ${section('Resumen del mes', `
          <div class="report-kpis">
            ${kpi('Ingresos', formatMoney(s.income))}
            ${kpi('Gastos', formatMoney(s.expense))}
            ${kpi('Ahorro', formatMoney(s.savings, { sign: true }))}
            ${kpi('Tasa de ahorro', s.income > 0 ? formatPercent(s.rate) : '—')}
            ${kpi('Gasto medio diario', formatMoney(s.avgDaily), s.maxDay ? `Día con más gasto: ${formatDate(s.maxDay.date, 'dayMonth')}` : '')}
            ${kpi('Movimientos', String(s.count))}
          </div>
          <p class="report-note">Saldo actual: <strong>${formatMoney(money.balance)}</strong>${horizon !== 'off' ? ` · Pagos recurrentes pendientes: ${formatMoney(money.pending)} · Dinero disponible: <strong>${formatMoney(money.available)}</strong>` : ''}</p>`)}

        ${section(`Comparación con ${monthLabel(Utils.addMonths(key, -1)).toLowerCase()}`, comparisonHTML(key))}
        ${section('Categorías con mayor gasto', categoriesHTML(key))}
        ${section('Presupuestos', budgetsHTML(key))}
        ${section('Objetivos de ahorro', goalsHTML())}
        ${section('Pagos recurrentes del mes', recurringHTML(key))}
        ${section('Avisos y consejos', notesHTML(key))}

        <footer class="report-footer">
          MyBudget v${Store.APP_VERSION.replace(/\.0$/, '')} · Informe generado en tu navegador a partir de tus datos locales. Ningún dato ha salido de tu dispositivo.
        </footer>
      </article>`;
  }

  /** Imprime el informe. El título del documento es el nombre que propone el navegador para el PDF */
  function print() {
    const previous = document.title;
    document.title = `Informe MyBudget ${monthLabel(currentKey)}`;
    window.addEventListener('afterprint', () => { document.title = previous; }, { once: true });
    window.print();
  }

  const actions = {
    'print-report': print,
    'report-csv': () => Transactions.exportCSV(Transactions.forMonth(currentKey), `mybudget-movimientos-${currentKey}.csv`),
  };

  return { render, actions };
})();
