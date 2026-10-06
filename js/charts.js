/**
 * charts.js
 * Gráficas con Chart.js usando siempre los datos reales guardados.
 * Si Chart.js no se pudiera cargar, se muestra un aviso y la app sigue funcionando.
 */
const Charts = (() => {
  const { formatMoney, monthLabel, centsToEuros } = Utils;
  const instances = {};
  const MAX_SLICES = 7; // a partir de aquí se agrupa en "Resto" para que la gráfica sea legible

  function available() {
    return typeof Chart !== 'undefined';
  }

  /** Colores leídos de las variables CSS (cambian con el tema) */
  function colors() {
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    return {
      text: v('--text-muted'), grid: v('--chart-grid'), surface: v('--surface'),
      income: v('--chart-income'), expense: v('--chart-expense'), savings: v('--chart-savings'),
      reference: v('--text-muted'), rest: v('--chart-rest'),
    };
  }

  const moneyTick = (value) => formatMoney(value * 100, { decimals: false });
  const moneyTooltip = (ctx) => ` ${ctx.dataset.label}: ${formatMoney(Math.round(ctx.parsed.y * 100))}`;

  function baseOptions(c) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: c.text, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 16 },
        },
        tooltip: { callbacks: { label: moneyTooltip }, padding: 10, cornerRadius: 8, boxPadding: 4 },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: c.text }, border: { display: false } },
        y: { grid: { color: c.grid }, ticks: { color: c.text, callback: moneyTick, maxTicksLimit: 6 }, border: { display: false }, beginAtZero: true },
      },
    };
  }

  /** Muestra la gráfica o un mensaje de "sin datos" en su contenedor */
  function setEmpty(canvas, empty, message = 'Sin datos para este periodo') {
    const box = canvas.closest('.chart-box');
    box.classList.toggle('is-empty', empty);
    let note = box.querySelector('.chart-empty');
    if (!note) {
      note = document.createElement('p');
      note.className = 'chart-empty';
      box.appendChild(note);
    }
    note.textContent = message;
  }

  /** Crea la gráfica o actualiza la existente (evita parpadeos al cambiar los datos) */
  function draw(id, config, isEmpty) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    if (!available()) {
      setEmpty(canvas, true, 'No se ha podido cargar la librería de gráficas (js/vendor/chart.umd.min.js).');
      return;
    }
    setEmpty(canvas, isEmpty);
    const existing = instances[id];
    if (isEmpty) {
      if (existing) { existing.destroy(); delete instances[id]; }
      return;
    }
    if (existing && existing.canvas === canvas && existing.config.type === config.type) {
      existing.data = config.data;
      existing.options = config.options;
      existing.update();
    } else {
      if (existing) existing.destroy();
      instances[id] = new Chart(canvas, config);
    }
  }

  /* ---------------------------------------------------------------
   * GASTOS POR CATEGORÍA (doughnut)
   * ------------------------------------------------------------- */
  function categoryDoughnut(id, key) {
    const c = colors();
    let items = Stats.categoriesForMonth(key);
    const total = Utils.sumBy(items, (i) => i.total);

    if (items.length > MAX_SLICES + 1) {
      const rest = items.slice(MAX_SLICES);
      items = [
        ...items.slice(0, MAX_SLICES),
        { category: { name: 'Resto', color: c.rest, icon: '•' }, total: Utils.sumBy(rest, (i) => i.total), pct: Utils.sumBy(rest, (i) => i.pct) },
      ];
    }

    draw(id, {
      type: 'doughnut',
      data: {
        labels: items.map((i) => i.category.name),
        datasets: [{
          label: 'Gasto',
          data: items.map((i) => centsToEuros(i.total)),
          backgroundColor: items.map((i) => i.category.color),
          borderColor: c.surface,
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        animation: { duration: 500 },
        plugins: {
          legend: { display: false }, // usamos una leyenda HTML con importes
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${formatMoney(Math.round(ctx.parsed * 100))} (${Utils.formatPercent(items[ctx.dataIndex].pct)})`,
            },
          },
        },
      },
    }, total === 0);

    // Leyenda HTML con importes y porcentajes
    const legend = document.getElementById(`${id}-legend`);
    if (legend) {
      legend.innerHTML = items.map((i) => `
        <li>
          <span class="legend-dot" style="background:${i.category.color}"></span>
          <span class="legend-name">${Utils.escapeHTML(i.category.name)}</span>
          <span class="legend-value">${formatMoney(i.total)}</span>
          <span class="legend-pct muted">${Utils.formatPercent(i.pct, 0)}</span>
        </li>`).join('');
    }
    const center = document.getElementById(`${id}-total`);
    if (center) center.innerHTML = total ? `<span>Total</span><strong>${formatMoney(total)}</strong>` : '';
  }

  /* ---------------------------------------------------------------
   * EVOLUCIÓN MENSUAL (líneas)
   * ------------------------------------------------------------- */
  function evolutionLine(id, endKey, months = 6, { savings = true } = {}) {
    const c = colors();
    const data = Stats.evolution(endKey, months);
    const isEmpty = data.every((m) => m.income === 0 && m.expense === 0);

    const line = (label, values, color, extra = {}) => ({
      label,
      data: values.map(centsToEuros),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBorderColor: c.surface,
      pointBorderWidth: 2,
      tension: 0.3,
      ...extra,
    });

    const datasets = [
      line('Ingresos', data.map((m) => m.income), c.income),
      line('Gastos', data.map((m) => m.expense), c.expense),
    ];
    if (savings) datasets.push(line('Ahorro', data.map((m) => m.savings), c.savings, { borderDash: [6, 4] }));

    const options = baseOptions(c);
    options.scales.y.beginAtZero = !data.some((m) => m.savings < 0);

    draw(id, {
      type: 'line',
      data: { labels: data.map((m) => `${monthLabel(m.key, true)} ${m.key.slice(2, 4)}`), datasets },
      options,
    }, isEmpty);
  }

  /* ---------------------------------------------------------------
   * GASTOS DIARIOS (barras)
   * ------------------------------------------------------------- */
  function dailyBar(id, key) {
    const c = colors();
    const days = Stats.dailyExpenses(key);
    const total = Utils.sumBy(days, (d) => d);
    const monthly = Budget.data().monthly;

    const datasets = [{
      type: 'bar',
      label: 'Gasto del día',
      data: days.map(centsToEuros),
      backgroundColor: c.expense,
      borderRadius: 4,
      borderSkipped: 'bottom',
      maxBarThickness: 18,
      order: 2,
    }];

    if (monthly) {
      const perDay = monthly / days.length;
      datasets.push({
        type: 'line',
        label: 'Presupuesto diario',
        data: days.map(() => centsToEuros(perDay)),
        borderColor: c.reference,
        borderDash: [5, 5],
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 0,
        order: 1,
      });
    }

    const options = baseOptions(c);
    options.plugins.tooltip.callbacks.title = (items) => `${items[0].label} de ${monthLabel(key).toLowerCase()}`;
    options.scales.x.ticks.maxTicksLimit = 16;

    draw(id, {
      type: 'bar',
      data: { labels: days.map((_, i) => String(i + 1)), datasets },
      options,
    }, total === 0);
  }

  function init() {
    if (!available()) return;
    Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
  }

  return { init, categoryDoughnut, evolutionLine, dailyBar, available };
})();
