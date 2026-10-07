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
        <td data-label="Mes"><button class="link-button" data-action="select-month" data-id="${escapeHTML(m.key)}">${monthLabel(m.key).split(' ')[0]}</button></td>
        <td data-label="Ingresos" class="td-amount amount-income">${formatMoney(m.income)}</td>
        <td data-label="Gastos" class="td-amount amount-expense">${formatMoney(m.expense)}</td>
        <td data-label="Ahorro" class="td-amount ${m.savings < 0 ? 'amount-negative' : ''}">${formatMoney(m.savings, { sign: true })}</td>
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

  /** Ingresos del mes por categoría (lista con barras) */
  function incomeListHTML(key) {
    const items = Stats.incomeByCategory(key);
    if (!items.length) return '<p class="muted">No hay ingresos este mes.</p>';
    return `<ol class="rank-list rank-list-wide">${items.map((c) => `
      <li>
        ${UI.categoryBadge(c.category, 'sm')}
        <div class="grow">
          <div class="rank-top">
            <button type="button" class="link-button rank-name" data-action="category-stats" data-id="${escapeHTML(c.categoryId)}">${escapeHTML(c.category.name)}</button>
            <strong class="rank-value amount-income">${formatMoney(c.total)}</strong>
          </div>
          <div class="rank-bar"><span style="width:${c.pct.toFixed(1)}%;background:${c.category.color}"></span></div>
          <div class="rank-bottom"><small>${formatPercent(c.pct, 0)} de los ingresos</small></div>
        </div>
      </li>`).join('')}</ol>`;
  }

  /** Tabla de gasto por categoría: el mes, su peso, la variación y la media de 6 meses */
  function categoryTableHTML(key) {
    const current = Stats.categoriesForMonth(key);
    if (!current.length) return '<p class="muted">No hay gastos este mes.</p>';
    const previous = Stats.categoriesForMonth(Utils.addMonths(key, -1));
    const sums = {};
    for (let i = 0; i < 6; i++) {
      Stats.categoriesForMonth(Utils.addMonths(key, -i)).forEach((c) => { sums[c.categoryId] = (sums[c.categoryId] || 0) + c.total; });
    }
    const limits = Budget.data().byCategory;
    return `
      <div class="table-wrapper">
        <table class="table category-table">
          <caption class="sr-only">Gasto por categoría en ${monthLabel(key)}</caption>
          <thead>
            <tr>
              <th scope="col">Categoría</th>
              <th scope="col" class="th-amount">Este mes</th>
              <th scope="col" class="th-amount">% del gasto</th>
              <th scope="col" class="th-amount">vs. mes anterior</th>
              <th scope="col" class="th-amount">Media 6 meses</th>
              <th scope="col" class="th-amount">Límite</th>
            </tr>
          </thead>
          <tbody>${current.map((c) => {
            const prev = (previous.find((p) => p.categoryId === c.categoryId) || { total: 0 }).total;
            const change = Stats.change(c.total, prev);
            const limit = limits[c.categoryId];
            return `
              <tr>
                <td data-label="Categoría"><span class="compare-category">${UI.categoryBadge(c.category, 'sm')}
                  <button type="button" class="link-button" data-action="category-stats" data-id="${escapeHTML(c.categoryId)}">${escapeHTML(c.category.name)}</button></span></td>
                <td data-label="Este mes" class="td-amount">${formatMoney(c.total)}</td>
                <td data-label="% del gasto" class="td-amount">${formatPercent(c.pct)}</td>
                <td data-label="vs. mes anterior" class="td-amount">${change === null
                  ? '<span class="muted">Nuevo</span>'
                  : `<span class="${change > 0 ? 'text-danger' : 'text-success'}">${change > 0 ? '▲' : '▼'} ${formatPercent(Math.abs(change), 0)}</span>`}</td>
                <td data-label="Media 6 meses" class="td-amount">${formatMoney(Math.round((sums[c.categoryId] || 0) / 6))}</td>
                <td data-label="Límite" class="td-amount">${limit ? `${formatMoney(limit)} <small class="muted">(${formatPercent(Utils.percent(c.total, limit), 0)})</small>` : '<span class="muted">—</span>'}</td>
              </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function render(key) {
    const view = $('#view-estadisticas');
    const year = Number(key.slice(0, 4));
    const month = Stats.monthStats(key);
    const y = Stats.yearStats(year);
    const trends = Stats.monthTrends(key);
    const prevRate = Stats.monthSummary(Utils.addMonths(key, -1));

    view.innerHTML = `
      <div class="page-actions">
        <a class="btn btn-ghost" href="#/comparar">${Icons.get('compare', 18)}<span class="label-long">Comparar meses</span><span class="label-short">Comparar</span></a>
        <a class="btn btn-ghost" href="#/informe">${Icons.get('fileText', 18)}<span class="label-long">Generar informe</span><span class="label-short">Informe</span></a>
      </div>

      <div class="kpi-grid kpi-grid-4">
        ${UI.kpi({ label: 'Ingresos', value: UI.money(month.income), icon: 'arrowUpRight', tone: 'income', foot: UI.trendBadge(trends.income, true) })}
        ${UI.kpi({ label: 'Gastos', value: UI.money(month.expense), icon: 'arrowDownRight', tone: 'expense', foot: UI.trendBadge(trends.expense, false) })}
        ${UI.kpi({
          label: 'Ahorro',
          value: UI.money(month.savings),
          icon: 'coins',
          tone: 'savings',
          foot: `${UI.trendBadge(trends.savings, true)}<span class="muted">Tasa de ahorro: <strong>${month.income > 0 ? formatPercent(month.rate) : '—'}</strong>${month.income > 0 && prevRate.income > 0 ? ` (${formatPercent(prevRate.rate)} el mes anterior)` : ''}</span>`,
        })}
        ${UI.kpi({
          label: 'Gasto medio diario',
          value: UI.money(month.avgDaily),
          icon: 'calendar',
          foot: `<span class="muted">${month.maxDay ? `Día con más gasto: ${formatDate(month.maxDay.date, 'dayMonth')} (${formatMoney(month.maxDay.total)})` : 'Sin gastos este mes'}</span>`,
        })}
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
        <section class="card card-chart">
          <h2 class="card-title">${Icons.get('calendar', 18)}Gastos diarios</h2>
          <div class="chart-box chart-lg"><canvas id="stats-daily" role="img" aria-label="Gastos de cada día del mes"></canvas></div>
        </section>
      </div>

      <section class="card">
        <h2 class="card-title">${Icons.get('trendUp', 18)}Evolución mensual (últimos 12 meses)</h2>
        <div class="chart-box chart-lg"><canvas id="stats-evolution" role="img" aria-label="Evolución de ingresos, gastos y ahorro"></canvas></div>
      </section>

      <section class="card">
        <div class="card-header">
          <h2 class="card-title">${Icons.get('tag', 18)}Gasto por categoría</h2>
          <a href="#/comparar" class="link">Comparar con otro mes</a>
        </div>
        ${categoryTableHTML(key)}
      </section>

      <section class="card">
        <h2 class="card-title">${Icons.get('arrowUpRight', 18)}Ingresos por categoría</h2>
        ${incomeListHTML(key)}
      </section>

      <div class="section-header">
        <div>
          <h2>Resumen del año ${year}</h2>
          <p class="muted">Estadísticas acumuladas del 1 de enero ${year === new Date().getFullYear() ? 'hasta hoy' : 'al 31 de diciembre'}</p>
        </div>
      </div>

      <div class="stat-grid">
        ${statCard('calendar', 'Gasto medio diario', UI.money(y.avgDaily), `en ${year}`)}
        ${statCard('chart', 'Gasto medio mensual', UI.money(y.avgMonthly), `en ${year}`)}
        ${statCard('tag', 'Categoría con más gasto', y.topCategory ? `${escapeHTML(y.topCategory.category.icon)} ${escapeHTML(y.topCategory.category.name)}` : '—',
          y.topCategory ? `${formatMoney(y.topCategory.total)} · ${formatPercent(y.topCategory.pct, 0)} del total` : 'Sin gastos')}
        ${statCard('receipt', 'Mayor gasto individual', y.biggest ? UI.money(y.biggest.amount) : '—',
          y.biggest ? `${escapeHTML(y.biggest.concept)} · ${formatDate(y.biggest.date)}` : 'Sin gastos')}
        ${statCard('alert', 'Día con mayor gasto', y.maxDay ? formatDate(y.maxDay.date) : '—', y.maxDay ? formatMoney(y.maxDay.total) : 'Sin gastos')}
        ${statCard('arrowDownRight', 'Total gastado', UI.money(y.expense), `${y.count} movimientos en ${year}`)}
        ${statCard('arrowUpRight', 'Total ingresado', UI.money(y.income), `en ${year}`)}
        ${statCard('coins', 'Total ahorrado', UI.money(y.savings), y.income ? `${formatPercent(y.rate)} de tus ingresos` : `en ${year}`)}
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
