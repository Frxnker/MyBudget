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

  function kpi({ label, value, icon, tone, trend = '', foot = '' }) {
    return `
      <div class="kpi kpi-${tone}">
        <div class="kpi-top">
          <span class="kpi-label">${label}</span>
          <span class="kpi-icon">${Icons.get(icon, 18)}</span>
        </div>
        <strong class="kpi-value">${value}</strong>
        ${foot}
        ${trend}
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
        <button class="btn btn-sm btn-light" data-action="clear-demo">Borrar datos de ejemplo</button>
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

  function recentHTML() {
    const recent = Transactions.all()
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
      .slice(0, 6);
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
              <small class="muted">${escapeHTML(category.name)} · ${formatDate(t.date)}</small>
            </span>
            <strong class="amount-${t.type}">${formatMoney(sign * t.amount, { sign: true })}</strong>
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
    return `
      ${s.limit ? `
        <div class="budget-mini">
          <div class="budget-mini-top">
            <span>${formatMoney(s.spent)} <span class="muted">de ${formatMoney(s.limit)}</span></span>
            <strong class="status-text-${s.level}">${formatPercent(s.pct, 0)}</strong>
          </div>
          ${UI.progressBar(s.pct, s.level, 'Presupuesto mensual')}
          <small class="muted">${s.available >= 0 ? `Te quedan ${formatMoney(s.available)}` : `Te has pasado ${formatMoney(-s.available)}`}</small>
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

  function topCategoriesHTML(key) {
    const top = Stats.topCategories(key, 5);
    if (!top.length) return '<p class="muted">No hay gastos este mes.</p>';
    return `<ol class="rank-list">${top.map((c, i) => `
      <li>
        <span class="rank-pos">${i + 1}</span>
        ${UI.categoryBadge(c.category, 'sm')}
        <span class="grow">
          <strong>${escapeHTML(c.category.name)}</strong>
          <small class="muted">${formatPercent(c.pct, 0)} del gasto</small>
        </span>
        <span class="rank-value">
          <strong>${formatMoney(c.total)}</strong>
          ${c.change === null
            ? '<small class="muted">Nuevo este mes</small>'
            : `<small class="${c.change > 0 ? 'text-danger' : 'text-success'}">${c.change > 0 ? '▲' : '▼'} ${formatPercent(Math.abs(c.change), 0)}</small>`}
        </span>
      </li>`).join('')}</ol>`;
  }

  function render(key) {
    const view = $('#view-dashboard');
    const summary = Stats.monthSummary(key);
    const trends = Stats.monthTrends(key);
    const balance = Stats.balance();
    const label = monthLabel(key);

    view.innerHTML = `
      ${demoBannerHTML()}
      ${alertsHTML(key)}

      <div class="dashboard-top">
        <section class="hero-card">
          <p class="hero-greeting">${greeting()} 👋</p>
          <span class="hero-label">Saldo actual</span>
          <strong class="hero-balance ${balance < 0 ? 'is-negative' : ''}">${formatMoney(balance)}</strong>
          <p class="hero-note">Balance acumulado de todos tus movimientos hasta hoy</p>
          <div class="hero-actions">
            <button class="btn btn-hero" data-action="add-expense">${Icons.get('arrowDownRight', 18)}Añadir gasto</button>
            <button class="btn btn-hero-ghost" data-action="add-income">${Icons.get('arrowUpRight', 18)}Añadir ingreso</button>
          </div>
        </section>

        <div class="kpi-grid kpi-grid-2">
          ${kpi({ label: `Ingresos · ${label}`, value: formatMoney(summary.income), icon: 'arrowUpRight', tone: 'income', trend: UI.trendBadge(trends.income, true) })}
          ${kpi({ label: `Gastos · ${label}`, value: formatMoney(summary.expense), icon: 'arrowDownRight', tone: 'expense', trend: UI.trendBadge(trends.expense, false) })}
          ${kpi({ label: 'Ahorro del mes', value: formatMoney(summary.savings), icon: 'coins', tone: 'savings', trend: UI.trendBadge(trends.savings, true) })}
          ${kpi({
            label: 'Porcentaje de ahorro',
            value: formatPercent(summary.rate),
            icon: 'pie',
            tone: 'rate',
            foot: UI.progressBar(Math.max(summary.rate, 0), summary.rate >= 20 ? 'goal' : summary.rate >= 0 ? 'warn' : 'over', 'Porcentaje de ahorro'),
            trend: trends.rate === null ? '' : `<span class="trend ${trends.rate >= 0 ? 'trend-good' : 'trend-bad'}">${trends.rate >= 0 ? '+' : ''}${formatPercent(trends.rate)} <span class="muted">puntos vs. mes anterior</span></span>`,
          })}
        </div>
      </div>

      <div class="grid grid-2-1">
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">${Icons.get('chart', 18)}Evolución de los últimos 6 meses</h2>
            <a href="#/estadisticas" class="link">Ver estadísticas</a>
          </div>
          <div class="chart-box chart-md"><canvas id="dash-evolution" aria-label="Gráfica de evolución de ingresos y gastos" role="img"></canvas></div>
        </section>
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">${Icons.get('pie', 18)}Gastos por categoría</h2>
          </div>
          <div class="chart-box chart-doughnut">
            <canvas id="dash-categories" aria-label="Gráfica de gastos por categoría" role="img"></canvas>
            <div class="doughnut-center" id="dash-categories-total"></div>
          </div>
          <ul class="chart-legend" id="dash-categories-legend"></ul>
        </section>
      </div>

      <div class="grid grid-2-1">
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">${Icons.get('wallet', 18)}Últimos movimientos</h2>
            <a href="#/movimientos" class="link">Ver todos</a>
          </div>
          ${recentHTML()}
        </section>
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">${Icons.get('clock', 18)}Próximos pagos</h2>
            <a href="#/recurrentes" class="link">Gestionar</a>
          </div>
          ${upcomingHTML()}
        </section>
      </div>

      <div class="grid grid-3">
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">${Icons.get('pie', 18)}Presupuesto de ${label.split(' ')[0].toLowerCase()}</h2>
            <a href="#/presupuestos" class="link">Detalles</a>
          </div>
          ${budgetHTML(key)}
        </section>
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">${Icons.get('trendUp', 18)}Dónde más gastas</h2>
          </div>
          ${topCategoriesHTML(key)}
        </section>
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">${Icons.get('target', 18)}Objetivos de ahorro</h2>
            <a href="#/objetivos" class="link">Ver todos</a>
          </div>
          ${goalsHTML()}
        </section>
      </div>`;

    Charts.evolutionLine('dash-evolution', key, 6);
    Charts.categoryDoughnut('dash-categories', key);
  }

  return { render };
})();
