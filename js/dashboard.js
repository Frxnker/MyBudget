/**
 * dashboard.js
 * Pantalla principal: resumen financiero del mes seleccionado.
 */
const Dashboard = (() => {
  const { $, escapeHTML, formatMoney, formatPercent, formatDate, monthLabel } = Utils;

  function greeting() {
    const hour = new Date().getHours();
    const name = Store.get('settings').userName;
    const text = hour < 6 ? 'Buenas noches' : hour < 14 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches';
    return name ? `${text}, ${escapeHTML(name)}` : text;
  }

  /** Título de tarjeta con icono y enlace opcional */
  function cardHeader(icon, title, link = '') {
    return `
      <div class="card-header">
        <h2 class="card-title">${Icons.get(icon, 18)}${title}</h2>
        ${link}
      </div>`;
  }

  function demoBannerHTML() {
    if (!Demo.hasDemoData() || Store.get('settings').demoBannerHidden) return '';
    return `
      <div class="banner">
        <span class="banner-icon">${Icons.get('sparkles', 20)}</span>
        <div class="grow">
          <strong>Estás viendo datos de ejemplo</strong>
          <p>Explora la aplicación con ellos y bórralos cuando quieras empezar con tus propios datos.</p>
        </div>
        <button class="btn btn-sm btn-ghost" data-action="clear-demo">Borrar datos de ejemplo</button>
        <button class="btn-icon btn-icon-sm" data-action="hide-demo-banner" aria-label="Ocultar aviso">${Icons.get('x', 16)}</button>
      </div>`;
  }

  function alertsHTML(key) {
    const alerts = Budget.alerts(key);
    if (!alerts.length) return '';
    return `<div class="alerts">${alerts.map((a) => `
      <div class="alert alert-${a.level}" role="alert">
        ${Icons.get('alert', 18)}<span>${escapeHTML(a.message)}</span>
        <a href="#/presupuestos" class="alert-link">Ver presupuestos</a>
      </div>`).join('')}</div>`;
  }

  /** Tarjeta principal: saldo, variación del mes y evolución del saldo */
  function heroHTML() {
    const balance = Stats.balance();
    const history = Stats.balanceHistory(6);
    const delta = history[history.length - 1].balance - history[history.length - 2].balance;
    const hasData = Transactions.all().length > 0;

    return `
      <section class="hero-card">
        <div class="hero-top">
          <div>
            <p class="hero-greeting">${greeting()}</p>
            <p class="hero-date">${formatDate(Utils.todayISO(), 'long')}</p>
          </div>
          <img class="hero-logo" src="assets/icons/logo.svg" alt="" width="34" height="34">
        </div>

        <div class="hero-body">
          <span class="hero-label">Saldo actual</span>
          <strong class="hero-balance ${balance < 0 ? 'is-negative' : ''}">${UI.money(balance)}</strong>
          ${hasData ? `
            <span class="hero-delta ${delta >= 0 ? 'is-up' : 'is-down'}">
              ${Icons.get(delta >= 0 ? 'arrowUp' : 'arrowDown', 14)}${formatMoney(delta, { sign: true })} este mes
            </span>` : '<span class="hero-delta">Añade tu primer movimiento para empezar</span>'}
        </div>

        ${hasData ? `
          <div class="hero-spark">
            ${UI.sparkline(history.map((h) => h.balance), { label: 'Evolución del saldo en los últimos 6 meses' })}
            <div class="hero-spark-axis">
              <span>${monthLabel(history[0].key, true)}</span>
              <span>Hoy</span>
            </div>
          </div>` : ''}

        <div class="hero-actions">
          <button class="btn btn-hero" data-action="add-expense">${Icons.get('arrowDownRight', 18)}Añadir gasto</button>
          <button class="btn btn-hero-ghost" data-action="add-income">${Icons.get('arrowUpRight', 18)}Añadir ingreso</button>
        </div>
      </section>`;
  }

  function kpisHTML(key) {
    const summary = Stats.monthSummary(key);
    const trends = Stats.monthTrends(key);
    const rateLevel = summary.rate >= 20 ? 'goal' : summary.rate >= 0 ? 'warn' : 'over';
    const rateTrend = trends.rate === null ? ''
      : `<span class="trend ${trends.rate >= 0 ? 'trend-good' : 'trend-bad'}">
          <span class="trend-chip">${Icons.get(trends.rate >= 0 ? 'arrowUp' : 'arrowDown', 12)}${formatPercent(Math.abs(trends.rate))}</span>
          <span class="trend-text">puntos vs. mes anterior</span>
        </span>`;

    return `
      <div class="kpi-grid kpi-grid-2">
        ${UI.kpi({ label: 'Ingresos', value: UI.money(summary.income), icon: 'arrowUpRight', tone: 'income', foot: UI.trendBadge(trends.income, true) })}
        ${UI.kpi({ label: 'Gastos', value: UI.money(summary.expense), icon: 'arrowDownRight', tone: 'expense', foot: UI.trendBadge(trends.expense, false) })}
        ${UI.kpi({ label: 'Ahorro del mes', value: UI.money(summary.savings), icon: 'coins', tone: 'savings', foot: UI.trendBadge(trends.savings, true) })}
        ${UI.kpi({
          label: 'Tasa de ahorro',
          value: formatPercent(summary.rate),
          icon: 'pie',
          tone: 'rate',
          foot: `${UI.progressBar(Math.max(summary.rate, 0), rateLevel, 'Porcentaje de ahorro')}${rateTrend}`,
        })}
      </div>`;
  }

  function recentHTML() {
    const recent = Transactions.recent(6);
    if (!recent.length) {
      return UI.emptyState({
        icon: 'inbox', title: 'Sin movimientos',
        text: 'Cuando añadas gastos o ingresos aparecerán aquí.',
        action: '<button class="btn btn-primary btn-sm" data-action="add-expense">Añadir gasto</button>',
      });
    }
    return `<ul class="tx-list">${recent.map((t) => {
      const category = Categories.get(t.categoryId);
      const sign = t.type === 'income' ? 1 : -1;
      return `
        <li>
          <button class="tx-list-item" data-action="edit-tx" data-id="${escapeHTML(t.id)}" title="Editar movimiento">
            ${UI.categoryBadge(category)}
            <span class="grow">
              <strong>${escapeHTML(t.concept)}</strong>
              <small>${escapeHTML(category.name)} · ${formatDate(t.date)}</small>
            </span>
            <strong class="tx-list-amount amount-${t.type}">${formatMoney(sign * t.amount, { sign: true })}</strong>
          </button>
        </li>`;
    }).join('')}</ul>`;
  }

  function budgetHTML(key) {
    const s = Budget.monthlyStatus(key);
    const categories = Budget.categoryStatuses(key).slice(0, 3);
    if (!s.limit && !categories.length) {
      return UI.emptyState({
        icon: 'pie', title: 'Sin presupuesto',
        text: 'Define un presupuesto mensual para controlar tus gastos.',
        action: '<a class="btn btn-primary btn-sm" href="#/presupuestos">Crear presupuesto</a>',
      });
    }
    const pace = Budget.idealPace(key, s.limit);
    return `
      ${s.limit ? `
        <div class="budget-mini">
          <div class="budget-mini-top">
            <span><strong>${formatMoney(s.spent)}</strong> <span class="muted">de ${formatMoney(s.limit)}</span></span>
            <span class="status-pill status-${s.level}">${formatPercent(s.pct, 0)}</span>
          </div>
          ${UI.progressBar(s.pct, s.level, 'Presupuesto mensual', pace ? { marker: pace.pct, markerLabel: `Ritmo ideal hoy: ${formatMoney(pace.amount)}` } : {})}
          <small class="muted">${s.available >= 0 ? `Te quedan ${formatMoney(s.available)}` : `Te has pasado ${formatMoney(-s.available)}`}${pace ? ` · ritmo ideal hoy ${formatMoney(pace.amount)}` : ''}</small>
        </div>` : ''}
      ${categories.length ? `<ul class="budget-mini-list">${categories.map((c) => `
        <li>
          <div class="budget-mini-top">
            <span>${escapeHTML(c.category.icon)} ${escapeHTML(c.category.name)}</span>
            <span class="muted">${formatMoney(c.spent)} / ${formatMoney(c.limit)}</span>
          </div>
          ${UI.progressBar(c.pct, c.level, `Límite de ${c.category.name}`)}
        </li>`).join('')}</ul>` : ''}`;
  }

  function upcomingHTML() {
    const list = Recurring.upcoming(30).slice(0, 5);
    if (!list.length) {
      return UI.emptyState({
        icon: 'repeat', title: 'Sin pagos próximos',
        text: 'Añade tus suscripciones y pagos periódicos.',
        action: '<a class="btn btn-ghost btn-sm" href="#/recurrentes">Ir a recurrentes</a>',
      });
    }
    return `<ul class="upcoming-list">${list.map(Recurring.upcomingItemHTML).join('')}</ul>`;
  }

  function goalsHTML() {
    const goals = Goals.all().slice(0, 3);
    if (!goals.length) {
      return UI.emptyState({
        icon: 'target', title: 'Sin objetivos',
        text: 'Crea un objetivo de ahorro y sigue su progreso.',
        action: '<button class="btn btn-primary btn-sm" data-action="add-goal">Crear objetivo</button>',
      });
    }
    return `<ul class="goal-mini-list">${goals.map(Goals.miniHTML).join('')}</ul>`;
  }

  /** Categorías con más gasto del mes, con su peso y la variación respecto al mes anterior */
  function topCategoriesHTML(key) {
    const top = Stats.topCategories(key, 5);
    if (!top.length) return '<p class="muted">No hay gastos este mes.</p>';
    return `<ol class="rank-list">${top.map((c) => `
      <li>
        ${UI.categoryBadge(c.category, 'sm')}
        <div class="grow">
          <div class="rank-top">
            <strong>${escapeHTML(c.category.name)}</strong>
            <strong class="rank-value">${formatMoney(c.total)}</strong>
          </div>
          <div class="rank-bar"><span style="width:${c.pct.toFixed(1)}%;background:${c.category.color}"></span></div>
          <div class="rank-bottom">
            <small>${formatPercent(c.pct, 0)} del gasto</small>
            ${c.change === null
              ? '<small>Nuevo este mes</small>'
              : `<small class="${c.change > 0 ? 'text-danger' : 'text-success'}">${c.change > 0 ? '▲' : '▼'} ${formatPercent(Math.abs(c.change), 0)}</small>`}
          </div>
        </div>
      </li>`).join('')}</ol>`;
  }

  function render(key) {
    const view = $('#view-dashboard');
    const month = monthLabel(key).split(' ')[0].toLowerCase();

    view.innerHTML = `
      ${demoBannerHTML()}
      ${alertsHTML(key)}

      <div class="dashboard-top">
        ${heroHTML()}
        ${kpisHTML(key)}
      </div>

      <div class="grid grid-2-1">
        <section class="card card-chart">
          ${cardHeader('chart', 'Ingresos y gastos', '<a href="#/estadisticas" class="link">Ver estadísticas</a>')}
          <div class="chart-box chart-md"><canvas id="dash-evolution" aria-label="Ingresos y gastos de los últimos 6 meses" role="img"></canvas></div>
        </section>
        <section class="card">
          ${cardHeader('pie', `Gastos de ${month}`)}
          <div class="chart-box chart-doughnut">
            <canvas id="dash-categories" aria-label="Gráfica de gastos por categoría" role="img"></canvas>
            <div class="doughnut-center" id="dash-categories-total"></div>
          </div>
          <ul class="chart-legend" id="dash-categories-legend"></ul>
        </section>
      </div>

      <div class="grid grid-2-1">
        <section class="card">
          ${cardHeader('wallet', 'Últimos movimientos', '<a href="#/movimientos" class="link">Ver todos</a>')}
          ${recentHTML()}
        </section>
        <section class="card">
          ${cardHeader('clock', 'Próximos pagos', '<a href="#/recurrentes" class="link">Gestionar</a>')}
          ${upcomingHTML()}
        </section>
      </div>

      <div class="grid grid-3">
        <section class="card">
          ${cardHeader('pie', `Presupuesto de ${month}`, '<a href="#/presupuestos" class="link">Detalles</a>')}
          ${budgetHTML(key)}
        </section>
        <section class="card">
          ${cardHeader('trendUp', 'Dónde más gastas')}
          ${topCategoriesHTML(key)}
        </section>
        <section class="card">
          ${cardHeader('target', 'Objetivos de ahorro', '<a href="#/objetivos" class="link">Ver todos</a>')}
          ${goalsHTML()}
        </section>
      </div>`;

    Charts.monthlyBars('dash-evolution', key, 6);
    Charts.categoryDoughnut('dash-categories', key);
  }

  return { render };
})();
