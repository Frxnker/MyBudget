/**
 * dashboard.js
 * Pantalla principal: resumen financiero del mes seleccionado.
 */
const Dashboard = (() => {
  const { $, escapeHTML, formatMoney, formatPercent, formatDate, monthLabel } = Utils;

  const MAX_ALERTS = 3;        // avisos visibles antes de "Ver más"
  let showAllAlerts = false;

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
          <strong><span class="label-long">Estás viendo datos de ejemplo</span><span class="label-short">Datos de ejemplo</span></strong>
          <p>Explora la aplicación con ellos y bórralos cuando quieras empezar con tus propios datos.</p>
        </div>
        <button class="btn btn-sm btn-ghost" data-action="clear-demo"><span class="label-long">Borrar datos de ejemplo</span><span class="label-short">Borrar</span></button>
        <button class="btn-icon btn-icon-sm" data-action="hide-demo-banner" aria-label="Ocultar aviso">${Icons.get('x', 16)}</button>
      </div>`;
  }

  /* ---------------------------------------------------------------
   * AVISOS
   * ------------------------------------------------------------- */

  function alertItemHTML(alert) {
    return `
      <div class="alert alert-${alert.level}">
        <span class="alert-icon">${Icons.get(alert.icon, 18)}</span>
        <span class="alert-text">${escapeHTML(alert.message)}</span>
        ${alert.link ? `<a href="${alert.link.href}" class="alert-link"><span class="label-long">${alert.link.label}</span><span class="label-short">Ver</span></a>` : ''}
      </div>`;
  }

  function alertsHTML(alerts) {
    if (!alerts.length) return '';
    const visible = showAllAlerts ? alerts : alerts.slice(0, MAX_ALERTS);
    const hidden = alerts.length - visible.length;
    const toggle = alerts.length > MAX_ALERTS
      ? `<button type="button" class="alerts-toggle" data-action="toggle-alerts" aria-expanded="${showAllAlerts}">
          ${showAllAlerts ? 'Mostrar menos avisos' : `Ver ${hidden} aviso${hidden > 1 ? 's' : ''} más`}${Icons.get(showAllAlerts ? 'chevronUp' : 'chevronDown', 16)}
        </button>`
      : '';
    return `<section class="alerts" aria-label="Avisos">${visible.map(alertItemHTML).join('')}${toggle}</section>`;
  }

  /* ---------------------------------------------------------------
   * SALDO Y DINERO DISPONIBLE
   * ------------------------------------------------------------- */

  /**
   * Dinero disponible = saldo actual − pagos recurrentes pendientes (hasta el horizonte elegido en
   * Configuración). Es solo un cálculo: el saldo real no cambia.
   */
  function availableHTML() {
    const horizon = Store.get('settings').availableHorizon;
    if (horizon === 'off') return '';
    const { list, until } = Recurring.pending(horizon);
    const money = Finance.availableMoney(Stats.balance(), list.map((o) => o.item.amount));
    const period = horizon === 'month' ? `hasta el ${formatDate(until, 'dayMonth')}` : `próximos ${horizon} días`;
    return `
      <div class="hero-available">
        <div>
          <span>Pagos próximos</span>
          <strong>${money.pending ? formatMoney(-money.pending) : formatMoney(0)}</strong>
          <small>${money.count} pago${money.count === 1 ? '' : 's'} · ${period}</small>
        </div>
        <div class="is-main">
          <span>Dinero disponible</span>
          <strong class="${money.available < 0 ? 'is-negative' : ''}">${UI.money(money.available)}</strong>
          <small><a href="#/configuracion" class="hero-link">Configurar</a></small>
        </div>
      </div>`;
  }

  /** Tarjeta principal: saldo, variación del mes, dinero disponible y evolución del saldo */
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
          ${hasData ? availableHTML() : ''}
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

  /* ---------------------------------------------------------------
   * INDICADORES DEL MES (con la comparación con el mes anterior)
   * ------------------------------------------------------------- */

  function kpisHTML(key) {
    const summary = Stats.monthSummary(key);
    const cmp = Stats.monthComparison(key);
    const future = key > Utils.currentMonthKey();
    // En el mes en curso se compara con el mismo periodo del mes anterior ("vs. 512 € a 7 sep.")
    const label = cmp.partial ? `a ${formatDate(cmp.prevEnd, 'dayMonth')}` : `en ${Alerts.monthName(cmp.prevKey)}`;
    const foot = (field, goodWhenUp) => {
      if (future) return '<span class="trend trend-neutral">El mes aún no ha empezado</span>';
      if (!cmp.previous.count) return UI.trendBadge(null);
      return UI.compareFoot(cmp.current[field], cmp.previous[field], { goodWhenUp, label });
    };
    const rateLevel = summary.rate >= 20 ? 'goal' : summary.rate >= 0 ? 'warn' : 'over';
    const rateCompare = !future && cmp.current.income > 0 && cmp.previous.income > 0
      ? UI.compareFoot(cmp.current.rate, cmp.previous.rate, { points: true, label })
      : '';

    return `
      <div class="kpi-grid kpi-grid-2">
        ${UI.kpi({ label: 'Ingresos', value: UI.money(summary.income), icon: 'arrowUpRight', tone: 'income', foot: foot('income', true) })}
        ${UI.kpi({ label: 'Gastos', value: UI.money(summary.expense), icon: 'arrowDownRight', tone: 'expense', foot: foot('expense', false) })}
        ${UI.kpi({ label: 'Ahorro del mes', value: UI.money(summary.savings), icon: 'coins', tone: 'savings', foot: foot('savings', true) })}
        ${UI.kpi({
          label: 'Tasa de ahorro',
          value: summary.income > 0 ? formatPercent(summary.rate) : '—',
          icon: 'pie',
          tone: 'rate',
          foot: `${UI.progressBar(Math.max(summary.rate, 0), rateLevel, 'Porcentaje de ahorro')}${rateCompare}`,
        })}
      </div>`;
  }

  /* ---------------------------------------------------------------
   * GRÁFICA DE EVOLUCIÓN
   * ------------------------------------------------------------- */

  /** Último día que muestra la gráfica: hoy o el final del mes elegido si ya terminó */
  function chartEnd(key) {
    const today = Utils.todayISO();
    const end = Utils.monthEnd(key);
    return end < today ? end : today;
  }

  function evolutionCardHTML(range) {
    return `
      <section class="card card-chart">
        <div class="card-header card-header-wrap">
          <h2 class="card-title">${Icons.get('chart', 18)}Evolución</h2>
          ${UI.choiceGroup({
            action: 'set-chart-range',
            label: 'Periodo de la gráfica',
            selected: range,
            options: Object.entries(Finance.RANGES).map(([value, r]) => ({ value, label: r.label, short: r.short })),
          })}
        </div>
        <div class="chart-box chart-md"><canvas id="dash-evolution" role="img" aria-label="Evolución del saldo, los ingresos y los gastos"></canvas></div>
        <p class="chart-caption" id="dash-evolution-caption"></p>
      </section>`;
  }

  /** Resumen en texto del periodo de la gráfica (también sirve a los lectores de pantalla) */
  function evolutionCaption(buckets) {
    const first = buckets[0];
    const last = buckets[buckets.length - 1];
    const opening = first.balance - first.income + first.expense;
    const income = Utils.sumBy(buckets, (b) => b.income);
    const expense = Utils.sumBy(buckets, (b) => b.expense);
    return `Saldo: <strong>${formatMoney(opening)}</strong> → <strong>${formatMoney(last.balance)}</strong> · `
      + `Ingresos: <strong class="amount-income">${formatMoney(income)}</strong> · Gastos: <strong>${formatMoney(expense)}</strong>`;
  }

  /* ---------------------------------------------------------------
   * TARJETAS
   * ------------------------------------------------------------- */

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
              <strong>${escapeHTML(t.concept)}${t.receiptId ? `<span class="receipt-mark" title="Tiene recibo">${Icons.get('paperclip', 12)}<span class="sr-only"> (con recibo)</span></span>` : ''}</strong>
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
    const p = Budget.plan(key);
    const planHTML = p ? `
      <dl class="budget-mini-plan">
        <div><dt>Restante</dt><dd>${formatMoney(Math.max(p.remaining, 0))}</dd></div>
        <div><dt>Días</dt><dd>${p.daysLeft}</dd></div>
        <div><dt>Recomendado</dt><dd>${formatMoney(p.recommendedDaily)}<small>/día</small></dd></div>
      </dl>
      ${p.status === 'ok'
        ? `<small class="budget-mini-status text-success">${Icons.get('check', 14)}Dentro del presupuesto previsto</small>`
        : `<small class="budget-mini-status text-warn">${Icons.get('alert', 14)}${p.status === 'over' ? 'Presupuesto superado' : 'Gastas más rápido de lo recomendado'}</small>`}
      <small class="muted">Previsión: ${formatMoney(p.projected)} a final de mes</small>` : '';
    return `
      ${s.limit ? `
        <div class="budget-mini">
          <div class="budget-mini-top">
            <span><strong>${formatMoney(s.spent)}</strong> <span class="muted">de ${formatMoney(s.limit)}</span></span>
            <span class="status-pill status-${s.level}">${formatPercent(s.pct, 0)}</span>
          </div>
          ${UI.progressBar(s.pct, s.level, 'Presupuesto mensual', pace ? { marker: pace.pct, markerLabel: `Ritmo ideal hoy: ${formatMoney(pace.amount)}` } : {})}
          ${p ? planHTML : `<small class="muted">${s.available >= 0 ? `Te quedan ${formatMoney(s.available)}` : `Te has pasado ${formatMoney(-s.available)}`}</small>`}
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
    const all = Recurring.upcoming(30);
    const list = all.slice(0, 5);
    if (!list.length) {
      return UI.emptyState({
        icon: 'repeat', title: 'Sin pagos próximos',
        text: 'Añade tus suscripciones y pagos periódicos.',
        action: '<a class="btn btn-ghost btn-sm" href="#/recurrentes">Ir a recurrentes</a>',
      });
    }
    return `
      <ul class="upcoming-list">${list.map(Recurring.upcomingItemHTML).join('')}</ul>
      <div class="card-total"><span>${all.length} pago${all.length === 1 ? '' : 's'} en 30 días</span><strong>${formatMoney(Utils.sumBy(all, (o) => o.item.amount))}</strong></div>`;
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
            <button type="button" class="link-button rank-name" data-action="category-stats" data-id="${escapeHTML(c.categoryId)}">${escapeHTML(c.category.name)}</button>
            <strong class="rank-value">${formatMoney(c.total)}</strong>
          </div>
          <div class="rank-bar"><span style="width:${c.pct.toFixed(1)}%;background:${c.category.color}"></span></div>
          <div class="rank-bottom">
            <small>${formatPercent(c.pct, 0)} del gasto</small>
            ${c.change === null
              ? '<small>Nuevo este mes</small>'
              : `<small class="${c.change > 0 ? 'text-danger' : 'text-success'}">${c.change > 0 ? '▲' : '▼'} ${formatPercent(Math.abs(c.change), 0)}<span class="sr-only"> respecto al mes anterior</span></small>`}
          </div>
        </div>
      </li>`).join('')}</ol>`;
  }

  /** Consejos automáticos (los temas que ya muestra un aviso no se repiten) */
  function insightsHTML(insights) {
    if (!insights.length) {
      return UI.emptyState({
        icon: 'lightbulb', title: 'Aún no hay consejos',
        text: 'Cuando tengas movimientos de varios meses aparecerán aquí análisis de tus finanzas.',
      });
    }
    return `<ul class="insight-list">${insights.map((i) => `
      <li class="insight insight-${i.tone}">
        <span class="insight-icon">${Icons.get(i.icon, 16)}</span>
        <p>${escapeHTML(i.text)}</p>
      </li>`).join('')}</ul>`;
  }

  function render(key) {
    const view = $('#view-dashboard');
    const month = monthLabel(key).split(' ')[0].toLowerCase();
    const alerts = Alerts.forMonth(key);
    const insights = Insights.withoutAlertTopics(Insights.forMonth(key), alerts);
    const range = Store.get('settings').chartRange;

    view.innerHTML = `
      ${demoBannerHTML()}
      ${alertsHTML(alerts)}

      <div class="dashboard-top">
        ${heroHTML()}
        ${kpisHTML(key)}
      </div>

      <div class="grid grid-2-1">
        ${evolutionCardHTML(range)}
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
      </div>

      <section class="card">
        ${cardHeader('lightbulb', 'Consejos para ti', '<a href="#/informe" class="link">Generar informe</a>')}
        ${insightsHTML(insights)}
      </section>`;

    const buckets = Stats.timeline(range, chartEnd(key));
    Charts.timelineChart('dash-evolution', buckets);
    const caption = $('#dash-evolution-caption');
    if (caption) caption.innerHTML = Transactions.all().length ? evolutionCaption(buckets) : '';
    Charts.categoryDoughnut('dash-categories', key);
  }

  const actions = {
    'toggle-alerts': () => {
      showAllAlerts = !showAllAlerts;
      App.render();
    },
    'set-chart-range': (range) => {
      if (!Finance.RANGES[range]) return;
      Store.set('settings', { ...Store.get('settings'), chartRange: range });
    },
  };

  return { render, actions };
})();
