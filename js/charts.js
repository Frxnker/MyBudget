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

  /** En móvil las gráficas usan etiquetas más cortas y nunca giran el eje X */
  function isCompact() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  /** Etiqueta de un mes en el eje X: "Oct 26" en escritorio y "Oct" en móvil */
  function axisMonth(key) {
    return isCompact() ? monthLabel(key, true) : `${monthLabel(key, true)} ${key.slice(2, 4)}`;
  }

  /** Colores leídos de las variables CSS (cambian con el tema) */
  function colors() {
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    return {
      text: v('--text'), text2: v('--text-2'), muted: v('--text-muted'),
      surface: v('--surface'), border: v('--border'), grid: v('--chart-grid'),
      income: v('--chart-income'), expense: v('--chart-expense'), savings: v('--chart-savings'),
      rest: v('--chart-rest'), guide: v('--chart-guide'), band: v('--chart-band'),
    };
  }

  /*
   * Plugin propio: al pasar el ratón resalta la columna activa
   * (una banda suave en las gráficas de barras y una línea guía en las de líneas).
   */
  const hoverGuide = {
    id: 'hoverGuide',
    beforeDatasetsDraw(chart, args, options) {
      if (chart.config.type === 'doughnut' || !options.color) return;
      const active = chart.tooltip && chart.tooltip.getActiveElements();
      if (!active || !active.length) return;
      const { ctx, chartArea } = chart;
      const x = active[0].element.x;
      ctx.save();
      if (chart.config.type === 'line') {
        ctx.strokeStyle = options.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
      } else {
        const width = chartArea.width / chart.data.labels.length;
        ctx.fillStyle = options.band;
        ctx.fillRect(x - width / 2, chartArea.top, width, chartArea.bottom - chartArea.top);
      }
      ctx.restore();
    },
  };

  const moneyTick = (value) => formatMoney(value * 100, { decimals: false });
  const moneyTooltip = (ctx) => ` ${ctx.dataset.label}: ${formatMoney(Math.round(ctx.parsed.y * 100))}`;

  function tooltipStyle(c) {
    return {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      titleColor: c.text,
      bodyColor: c.text2,
      titleFont: { weight: '700' },
      padding: 12,
      cornerRadius: 12,
      boxPadding: 6,
      usePointStyle: true,
      caretSize: 0,
    };
  }

  function baseOptions(c) {
    const compact = isCompact();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: c.text2, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: compact ? 12 : 18 },
        },
        tooltip: { ...tooltipStyle(c), callbacks: { label: moneyTooltip } },
        hoverGuide: { color: c.guide, band: c.band },
      },
      scales: {
        // Sin rotación: si no caben todas las etiquetas, Chart.js omite algunas en lugar de girarlas
        x: { grid: { display: false }, ticks: { color: c.muted, padding: 6, maxRotation: 0, autoSkipPadding: compact ? 8 : 4 }, border: { display: false } },
        y: {
          grid: { color: c.grid },
          ticks: { color: c.muted, callback: moneyTick, maxTicksLimit: compact ? 5 : 6, padding: compact ? 4 : 8 },
          border: { display: false },
          beginAtZero: true,
        },
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

  /**
   * Crea la gráfica o actualiza la existente.
   * Cada vez que cambian los datos la vista se vuelve a pintar con un <canvas> nuevo. En lugar de
   * destruir la gráfica y crearla otra vez, se coloca su contenedor anterior en el nuevo hueco y se
   * actualizan los datos: Chart.js anima la transición y se ahorra el coste de recrearla.
   */
  function draw(id, config, isEmpty) {
    let canvas = document.getElementById(id);
    if (!canvas) return;
    if (!available()) {
      setEmpty(canvas, true, 'No se ha podido cargar la librería de gráficas (js/vendor/chart.umd.min.js).');
      return;
    }
    const existing = instances[id];
    if (isEmpty) {
      if (existing) { existing.destroy(); delete instances[id]; }
      setEmpty(canvas, true);
      return;
    }
    if (existing && existing.config.type === config.type) {
      const oldBox = existing.canvas.closest('.chart-box');
      const newBox = canvas.closest('.chart-box');
      // Se mueve la caja entera: Chart.js vigila el tamaño del contenedor, no solo del canvas
      if (oldBox && newBox && oldBox !== newBox) newBox.replaceWith(oldBox);
      canvas = existing.canvas;
      setEmpty(canvas, false);
      existing.data = config.data;
      existing.options = config.options;
      existing.update();
    } else {
      if (existing) existing.destroy();
      setEmpty(canvas, false);
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
          borderWidth: 0,
          spacing: 3,
          borderRadius: 5,
          hoverOffset: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '74%',
        layout: { padding: 6 },
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false }, // usamos una leyenda HTML con importes
          tooltip: {
            ...tooltipStyle(c),
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
          <span class="legend-pct">${Utils.formatPercent(i.pct, 0)}</span>
        </li>`).join('');
    }
    const center = document.getElementById(`${id}-total`);
    if (center) center.innerHTML = total ? `<span>Total gastado</span><strong>${UI.money(total)}</strong>` : '';
  }

  /* ---------------------------------------------------------------
   * INGRESOS Y GASTOS POR MES (barras agrupadas, dashboard)
   * ------------------------------------------------------------- */
  function monthlyBars(id, endKey, months = 6) {
    const c = colors();
    const data = Stats.evolution(endKey, months);
    const bar = (label, values, color) => ({
      label,
      data: values.map(centsToEuros),
      backgroundColor: color,
      borderRadius: 6,
      borderSkipped: 'start',
      categoryPercentage: 0.62,
      barPercentage: 0.86,
      maxBarThickness: 26,
    });

    const options = baseOptions(c);
    options.plugins.tooltip.callbacks.footer = (items) => {
      const month = data[items[0].dataIndex];
      return month.count ? `Ahorro: ${formatMoney(month.savings, { sign: true })}` : 'Sin movimientos';
    };
    options.plugins.tooltip.footerColor = c.text;

    draw(id, {
      type: 'bar',
      data: {
        labels: data.map((m) => axisMonth(m.key)),
        datasets: [
          bar('Ingresos', data.map((m) => m.income), c.income),
          bar('Gastos', data.map((m) => m.expense), c.expense),
        ],
      },
      options,
    }, data.every((m) => m.count === 0));
  }

  /* ---------------------------------------------------------------
   * EVOLUCIÓN MENSUAL (líneas)
   * Los meses sin ningún movimiento se dejan como hueco: "sin datos" no es lo mismo que 0 €.
   * ------------------------------------------------------------- */
  function evolutionLine(id, endKey, months = 6, { savings = true } = {}) {
    const c = colors();
    const data = Stats.evolution(endKey, months);
    const value = (m, field) => (m.count ? centsToEuros(m[field]) : null);

    const line = (label, field, color, extra = {}) => ({
      label,
      data: data.map((m) => value(m, field)),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 3.5,
      pointHoverRadius: 6,
      pointBackgroundColor: color,
      pointBorderColor: c.surface,
      pointBorderWidth: 2,
      tension: 0.35,
      spanGaps: false,
      ...extra,
    });

    const datasets = [
      line('Ingresos', 'income', c.income),
      line('Gastos', 'expense', c.expense),
    ];
    if (savings) datasets.push(line('Ahorro', 'savings', c.savings, { borderDash: [6, 4] }));

    const options = baseOptions(c);
    options.scales.y.beginAtZero = !data.some((m) => m.savings < 0);

    draw(id, {
      type: 'line',
      data: { labels: data.map((m) => axisMonth(m.key)), datasets },
      options,
    }, data.every((m) => m.count === 0));
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
      borderSkipped: 'start',
      maxBarThickness: 16,
      order: 2,
    }];

    if (monthly) {
      const perDay = monthly / days.length;
      datasets.push({
        type: 'line',
        label: 'Presupuesto diario',
        data: days.map(() => centsToEuros(perDay)),
        borderColor: c.muted,
        borderDash: [5, 5],
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 0,
        order: 1,
      });
    }

    const options = baseOptions(c);
    options.plugins.tooltip.callbacks.title = (items) => `${items[0].label} de ${monthLabel(key).toLowerCase()}`;
    options.scales.x.ticks.maxTicksLimit = isCompact() ? 8 : 16;

    draw(id, {
      type: 'bar',
      data: { labels: days.map((_, i) => String(i + 1)), datasets },
      options,
    }, total === 0);
  }

  function init() {
    if (!available()) return;
    Chart.register(hoverGuide);
    Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
  }

  return { init, categoryDoughnut, monthlyBars, evolutionLine, dailyBar, available };
})();
