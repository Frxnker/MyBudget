/**
 * compare-view.js
 * Vista "Comparar": enfrenta dos meses cualesquiera. Muestra ingresos, gastos, ahorro, tasa de
 * ahorro, número de movimientos, gasto medio diario y el gasto (e ingreso) por categoría, con las
 * diferencias en euros y en porcentaje. Los cálculos están en Stats.compareMonths.
 */
const CompareView = (() => {
  const { $, escapeHTML, formatMoney, formatPercent, monthLabel } = Utils;

  // Meses elegidos ("AAAA-MM"): "a" es el mes base y "b" el que se compara con él
  const state = { a: null, b: null };

  /** Meses que se pueden elegir: los que tienen movimientos, el actual y los ya elegidos */
  function monthOptions() {
    const keys = new Set(Transactions.monthKeys());
    keys.add(Utils.currentMonthKey());
    if (state.a) keys.add(state.a);
    if (state.b) keys.add(state.b);
    return [...keys].sort().reverse();
  }

  const shortMonth = (key) => `${monthLabel(key, true)} ${key.slice(2, 4)}`;

  function formatValue(metric, value) {
    if (value === null || value === undefined) return '—';
    if (metric.kind === 'points') return formatPercent(value);
    if (metric.kind === 'count') return String(value);
    return formatMoney(value);
  }

  /** Diferencia con flecha y texto (no solo color). "goodWhenUp" null = neutral */
  function changeHTML({ diff, pct, kind = 'money', goodWhenUp }) {
    if (diff === null || diff === undefined) return '<span class="trend trend-neutral">Sin datos</span>';
    if (Math.abs(diff) < (kind === 'points' ? 0.05 : 1)) return '<span class="trend trend-neutral"><span class="trend-chip">= Igual</span></span>';
    const up = diff > 0;
    const tone = goodWhenUp === null ? 'trend-neutral' : (up === goodWhenUp ? 'trend-good' : 'trend-bad');
    const arrow = `${Icons.get(up ? 'arrowUp' : 'arrowDown', 12)}<span class="sr-only">${up ? 'Sube' : 'Baja'} </span>`;
    // La tasa de ahorro se compara en puntos: no tiene porcentaje de variación
    if (kind === 'points') {
      return `<span class="trend ${tone}"><span class="trend-chip">${arrow}${Math.abs(diff).toFixed(1).replace('.', ',')} pts</span></span>`;
    }
    const amount = kind === 'count' ? `${up ? '+' : '−'}${Math.abs(diff)}` : formatMoney(diff, { sign: true });
    const chip = pct === null || pct === undefined
      ? `<span class="trend-chip">${arrow}Nuevo</span>`
      : `<span class="trend-chip">${arrow}${formatPercent(Math.abs(pct))}</span>`;
    return `<span class="trend ${tone}">${chip}<span class="trend-text">${amount}</span></span>`;
  }

  function metricHTML(metric, a, b) {
    return `
      <article class="compare-metric">
        <span class="compare-metric-label">${metric.label}</span>
        <div class="compare-values">
          <span class="compare-value"><small>${shortMonth(a)}</small>${formatValue(metric, metric.a)}</span>
          <span class="compare-arrow" aria-hidden="true">${Icons.get('chevronRight', 16)}</span>
          <strong class="compare-value is-main"><small>${shortMonth(b)}</small>${formatValue(metric, metric.b)}</strong>
        </div>
        ${changeHTML(metric)}
      </article>`;
  }

  /** Tabla por categoría. "goodWhenUp" es false para los gastos (subir es malo) y true para los ingresos */
  function categoryTableHTML(rows, a, b, goodWhenUp, caption) {
    if (!rows.length) return '<p class="muted">No hay movimientos en ninguno de los dos meses.</p>';
    const totalA = Utils.sumBy(rows, (r) => r.a);
    const totalB = Utils.sumBy(rows, (r) => r.b);
    const total = Finance.compare(totalB, totalA);
    return `
      <div class="table-wrapper">
        <table class="table compare-table">
          <caption class="sr-only">${escapeHTML(caption)}</caption>
          <thead>
            <tr>
              <th scope="col">Categoría</th>
              <th scope="col" class="th-amount">${monthLabel(a)}</th>
              <th scope="col" class="th-amount">${monthLabel(b)}</th>
              <th scope="col" class="th-amount">Variación</th>
            </tr>
          </thead>
          <tbody>${rows.map((r) => `
            <tr>
              <td data-label="Categoría">
                <span class="compare-category">${UI.categoryBadge(r.category, 'sm')}
                  <button type="button" class="link-button" data-action="category-stats" data-id="${escapeHTML(r.categoryId)}">${escapeHTML(r.category.name)}</button>
                </span>
              </td>
              <td data-label="${shortMonth(a)}" class="td-amount">${formatMoney(r.a)}</td>
              <td data-label="${shortMonth(b)}" class="td-amount">${formatMoney(r.b)}</td>
              <td data-label="Variación" class="td-amount">${changeHTML({ diff: r.diff, pct: r.pct, goodWhenUp })}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td data-label="Total">Total</td>
              <td data-label="${shortMonth(a)}" class="td-amount">${formatMoney(totalA)}</td>
              <td data-label="${shortMonth(b)}" class="td-amount">${formatMoney(totalB)}</td>
              <td data-label="Variación" class="td-amount">${changeHTML({ diff: total.diff, pct: total.pct, goodWhenUp })}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  }

  function selectHTML(id, label, selected) {
    return `
      <div class="field">
        <label for="${id}">${label}</label>
        <select id="${id}">
          ${monthOptions().map((k) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${monthLabel(k)}${k === Utils.currentMonthKey() ? ' (actual)' : ''}</option>`).join('')}
        </select>
      </div>`;
  }

  let lastSelected = null;

  function render(selectedMonth) {
    const view = $('#view-comparar');
    // Al llegar con otro mes elegido en el selector general, se compara ese mes con el anterior
    if (selectedMonth !== lastSelected) {
      reset(selectedMonth);
      lastSelected = selectedMonth;
    }
    const { a, b } = state;
    const data = Stats.compareMonths(a, b);
    const isCurrent = (key) => key === Utils.currentMonthKey();
    const partialNote = isCurrent(a) || isCurrent(b)
      ? `<p class="hint">${Icons.get('info', 14)}<span>${monthLabel(isCurrent(b) ? b : a)} aún no ha terminado: sus datos son hasta hoy y el gasto medio diario se calcula con los días transcurridos.</span></p>`
      : '';

    view.innerHTML = `
      <section class="card compare-controls">
        <div class="compare-pickers">
          ${selectHTML('compare-a', 'Mes base', a)}
          <button type="button" class="btn-icon compare-swap" data-action="compare-swap" aria-label="Intercambiar los meses" title="Intercambiar">${Icons.get('compare', 18)}</button>
          ${selectHTML('compare-b', 'Comparar con', b)}
        </div>
        <div class="compare-presets">
          <button type="button" class="btn btn-ghost btn-sm" data-action="compare-preset" data-id="previous">Mes actual vs. anterior</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="compare-preset" data-id="last-year">Mismo mes del año anterior</button>
        </div>
        ${partialNote}
      </section>

      <div class="compare-grid">${data.metrics.map((m) => metricHTML(m, a, b)).join('')}</div>

      <section class="card">
        <h2 class="card-title">${Icons.get('chart', 18)}Gastos por categoría</h2>
        <div class="chart-box compare-chart" style="height:${Math.max(160, Math.min(data.expenses.length, 8) * 40 + 70)}px">
          <canvas id="compare-chart" role="img" aria-label="Gastos por categoría de ${monthLabel(a)} y ${monthLabel(b)}"></canvas>
        </div>
        ${categoryTableHTML(data.expenses, a, b, false, `Gastos por categoría: ${monthLabel(a)} frente a ${monthLabel(b)}`)}
      </section>

      <section class="card">
        <h2 class="card-title">${Icons.get('arrowUpRight', 18)}Ingresos por categoría</h2>
        ${categoryTableHTML(data.incomes, a, b, true, `Ingresos por categoría: ${monthLabel(a)} frente a ${monthLabel(b)}`)}
      </section>`;

    Charts.compareBars('compare-chart', data.expenses, monthLabel(a), monthLabel(b));

    $('#compare-a').addEventListener('change', (event) => { state.a = event.target.value; render(selectedMonth); });
    $('#compare-b').addEventListener('change', (event) => { state.b = event.target.value; render(selectedMonth); });
  }

  /** Para enlazar desde otras vistas: compara "b" con su mes anterior */
  function reset(b) {
    state.b = b;
    state.a = Utils.addMonths(b, -1);
  }

  const actions = {
    'compare-swap': () => {
      [state.a, state.b] = [state.b, state.a];
      App.render();
    },
    'compare-preset': (preset) => {
      if (preset === 'previous') reset(Utils.currentMonthKey());
      if (preset === 'last-year') state.a = Utils.addMonths(state.b, -12);
      App.render();
    },
  };

  return { render, reset, actions };
})();
