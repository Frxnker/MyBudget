/**
 * statistics-view.js
 * Vista de "Estadísticas": gráficas, indicadores anuales y resumen mes a mes.
 * Los cálculos se hacen en statistics.js; aquí solo se pintan.
 */
const StatsView = (() => {
  const { $, escapeHTML, formatMoney, formatPercent, formatDate, monthLabel } = Utils;

  function statCard(icon, label, value, detail = '') {
    return `
      <div class="stat-card">
        <span class="stat-icon">${Icons.get(icon, 18)}</span>
        <div>
          <span class="stat-label">${label}</span>
          <strong class="stat-value">${value}</strong>
          ${detail ? `<small class="muted">${detail}</small>` : ''}
        </div>
      </div>`;
  }

  function yearTableHTML(year, selectedKey) {
    const months = Stats.yearSummary(year);
    const totals = Stats.summarize(Transactions.all().filter((t) => t.date.startsWith(`${year}-`)));
    const row = (m) => `
      <tr class="${m.key === selectedKey ? 'is-selected' : ''} ${m.count ? '' : 'is-empty-row'}">
        <td data-label="Mes"><button class="link-button" data-action="select-month" data-id="${m.key}">${monthLabel(m.key).split(' ')[0]}</button></td>
        <td data-label="Ingresos" class="td-amount amount-income">${formatMoney(m.income)}</td>
        <td data-label="Gastos" class="td-amount amount-expense">${formatMoney(m.expense)}</td>
        <td data-label="Ahorro" class="td-amount">${formatMoney(m.savings, { sign: true })}</td>
        <td data-label="% ahorro" class="td-amount">${m.income ? formatPercent(m.rate) : '—'}</td>
      </tr>`;
    return `
      <div class="table-wrapper">
        <table class="table year-table">
          <thead><tr><th>Mes</th><th class="th-amount">Ingresos</th><th class="th-amount">Gastos</th><th class="th-amount">Ahorro</th><th class="th-amount">% ahorro</th></tr></thead>
          <tbody>${months.map(row).join('')}</tbody>
          <tfoot>
            <tr>
              <td data-label="Total">Total ${year}</td>
              <td data-label="Ingresos" class="td-amount amount-income">${formatMoney(totals.income)}</td>
              <td data-label="Gastos" class="td-amount amount-expense">${formatMoney(totals.expense)}</td>
              <td data-label="Ahorro" class="td-amount">${formatMoney(totals.savings, { sign: true })}</td>
              <td data-label="% ahorro" class="td-amount">${totals.income ? formatPercent(totals.rate) : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  }

  function render(key) {
    const view = $('#view-estadisticas');
    const year = Number(key.slice(0, 4));
    const month = Stats.monthStats(key);
    const y = Stats.yearStats(year);
    const trends = Stats.monthTrends(key);

    view.innerHTML = `
      <div class="section-header">
        <div>
          <h2>${monthLabel(key)}</h2>
          <p class="muted">Usa el selector de mes de la parte superior para cambiar el periodo</p>
        </div>
      </div>

      <div class="kpi-grid kpi-grid-4">
        <div class="kpi kpi-income"><span class="kpi-label">Ingresos</span><strong class="kpi-value">${formatMoney(month.income)}</strong>${UI.trendBadge(trends.income, true)}</div>
        <div class="kpi kpi-expense"><span class="kpi-label">Gastos</span><strong class="kpi-value">${formatMoney(month.expense)}</strong>${UI.trendBadge(trends.expense, false)}</div>
        <div class="kpi kpi-savings"><span class="kpi-label">Ahorro</span><strong class="kpi-value">${formatMoney(month.savings)}</strong>${UI.trendBadge(trends.savings, true)}</div>
        <div class="kpi"><span class="kpi-label">Gasto medio diario</span><strong class="kpi-value">${formatMoney(month.avgDaily)}</strong>
          <span class="kpi-foot muted">${month.maxDay ? `Día con más gasto: ${formatDate(month.maxDay.date, 'dayMonth')} (${formatMoney(month.maxDay.total)})` : 'Sin gastos este mes'}</span></div>
      </div>

      <div class="grid grid-1-2">
        <section class="card">
          <h2 class="card-title">${Icons.get('pie', 18)}Gastos por categoría</h2>
          <div class="chart-box chart-doughnut">
            <canvas id="stats-categories" role="img" aria-label="Gastos por categoría"></canvas>
            <div class="doughnut-center" id="stats-categories-total"></div>
          </div>
          <ul class="chart-legend" id="stats-categories-legend"></ul>
        </section>
        <section class="card">
          <h2 class="card-title">${Icons.get('calendar', 18)}Gastos diarios</h2>
          <div class="chart-box chart-lg"><canvas id="stats-daily" role="img" aria-label="Gastos de cada día del mes"></canvas></div>
        </section>
      </div>

      <section class="card">
        <h2 class="card-title">${Icons.get('trendUp', 18)}Evolución mensual (últimos 12 meses)</h2>
        <div class="chart-box chart-lg"><canvas id="stats-evolution" role="img" aria-label="Evolución de ingresos, gastos y ahorro"></canvas></div>
      </section>

      <div class="section-header">
        <div>
          <h2>Resumen del año ${year}</h2>
          <p class="muted">Estadísticas acumuladas del 1 de enero ${year === new Date().getFullYear() ? 'hasta hoy' : 'al 31 de diciembre'}</p>
        </div>
      </div>

      <div class="stat-grid">
        ${statCard('calendar', 'Gasto medio diario', formatMoney(y.avgDaily), `en ${year}`)}
        ${statCard('chart', 'Gasto medio mensual', formatMoney(y.avgMonthly), `en ${year}`)}
        ${statCard('tag', 'Categoría con más gasto', y.topCategory ? `${escapeHTML(y.topCategory.category.icon)} ${escapeHTML(y.topCategory.category.name)}` : '—',
          y.topCategory ? `${formatMoney(y.topCategory.total)} · ${formatPercent(y.topCategory.pct, 0)} del total` : 'Sin gastos')}
        ${statCard('receipt', 'Mayor gasto individual', y.biggest ? formatMoney(y.biggest.amount) : '—',
          y.biggest ? `${escapeHTML(y.biggest.concept)} · ${formatDate(y.biggest.date)}` : 'Sin gastos')}
        ${statCard('alert', 'Día con mayor gasto', y.maxDay ? formatDate(y.maxDay.date) : '—', y.maxDay ? formatMoney(y.maxDay.total) : 'Sin gastos')}
        ${statCard('arrowDownRight', 'Total gastado', formatMoney(y.expense), `${y.count} movimientos en ${year}`)}
        ${statCard('arrowUpRight', 'Total ingresado', formatMoney(y.income), `en ${year}`)}
        ${statCard('coins', 'Total ahorrado', formatMoney(y.savings), y.income ? `${formatPercent(y.rate)} de tus ingresos` : `en ${year}`)}
      </div>

      <section class="card">
        <h2 class="card-title">${Icons.get('database', 18)}Resumen anual mes a mes</h2>
        ${yearTableHTML(year, key)}
      </section>`;

    Charts.categoryDoughnut('stats-categories', key);
    Charts.dailyBar('stats-daily', key);
    Charts.evolutionLine('stats-evolution', key, 12);
  }

  return { render };
})();
