/**
 * insights.js
 * Consejos financieros automáticos. Es un análisis local de tus datos (sin IA ni servicios externos):
 * cada frase sale de un cálculo sobre los movimientos guardados y solo aparece si hay datos suficientes.
 *
 * build(context) es una función pura (se prueba en tests/finance-tests.js); forMonth(key) reúne los datos.
 */
const Insights = (() => {
  const { formatMoney, formatPercent } = Utils;

  const MAX_ITEMS = 6;
  const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];

  const lower = (text) => text.toLowerCase();
  const pct = (value) => formatPercent(Math.abs(value), 0);
  const points = (value) => Math.abs(value).toFixed(1).replace('.', ',');

  /**
   * context = {
   *   monthName, prevName, partial (mes en curso: se compara con el mismo periodo del mes anterior)
   *   top:              { name, total, pct } | null           categoría con más gasto
   *   categoryChanges:  [{ id, name, current, previous }]
   *   rate:             { current, previous } | null
   *   recurring:        { monthly, avgExpense } | null        equivalente mensual de los recurrentes y gasto medio mensual
   *   trend:            [{ name, expense }]                   últimos meses completos con datos, del más antiguo al más reciente
   *   weekday:          { weekday (0 = lunes), avg, overall } | null
   *   goal:             { name, remaining, avgSavings } | null
   * }
   * → [{ id, topic, tone (good | bad | neutral), icon, text }]
   */
  function build(ctx) {
    const list = [];
    const vsPrevious = ctx.partial ? 'el mes pasado a estas alturas' : `en ${ctx.prevName}`;
    const against = ctx.partial ? 'al mes pasado a estas alturas' : `a ${ctx.prevName}`;
    const period = ctx.partial ? 'este mes' : `en ${ctx.monthName}`;

    // Mayor cambio en una categoría (al menos 10 € y un 15 %)
    const change = (ctx.categoryChanges || [])
      .filter((c) => c.previous >= 1000 && Math.abs(c.current - c.previous) >= 1000
        && Math.abs((c.current - c.previous) / c.previous) >= 0.15)
      .sort((a, b) => Math.abs(b.current - b.previous) - Math.abs(a.current - a.previous))[0];
    if (change) {
      const diff = ((change.current - change.previous) / change.previous) * 100;
      const subject = ctx.partial ? 'Este mes llevas gastado' : `En ${ctx.monthName} gastaste`;
      list.push({
        id: `category-${change.id}`, topic: `category-${change.id}`, tone: diff > 0 ? 'bad' : 'good',
        icon: diff > 0 ? 'trendUp' : 'trendDown',
        text: `${subject} un ${pct(diff)} ${diff > 0 ? 'más' : 'menos'} en ${lower(change.name)} que ${vsPrevious}.`,
      });
    }

    // Tasa de ahorro
    if (ctx.rate) {
      const diff = ctx.rate.current - ctx.rate.previous;
      if (Math.abs(diff) >= 1) {
        list.push({
          id: 'rate', topic: 'rate', tone: diff > 0 ? 'good' : 'bad', icon: diff > 0 ? 'trendUp' : 'trendDown',
          text: `Tu tasa de ahorro ha ${diff > 0 ? 'aumentado' : 'bajado'} ${points(diff)} puntos respecto ${against} (del ${formatPercent(ctx.rate.previous)} al ${formatPercent(ctx.rate.current)}).`,
        });
      }
    }

    // Tendencia de los últimos meses completos
    const trend = ctx.trend || [];
    let down = 0;
    let up = 0;
    for (let i = trend.length - 1; i > 0; i--) {
      if (trend[i].expense < trend[i - 1].expense && !up) down += 1;
      else if (trend[i].expense > trend[i - 1].expense && !down) up += 1;
      else break;
    }
    if (down >= 2) {
      const first = trend[trend.length - 1 - down];
      const last = trend[trend.length - 1];
      list.push({
        id: 'trend', topic: 'trend', tone: 'good', icon: 'trendDown',
        text: `Has reducido tus gastos ${down} meses seguidos: de ${formatMoney(first.expense)} en ${first.name} a ${formatMoney(last.expense)} en ${last.name}.`,
      });
    } else if (up >= 2) {
      const first = trend[trend.length - 1 - up];
      const last = trend[trend.length - 1];
      list.push({
        id: 'trend', topic: 'trend', tone: 'bad', icon: 'trendUp',
        text: `Tus gastos han aumentado ${up} meses seguidos: de ${formatMoney(first.expense)} en ${first.name} a ${formatMoney(last.expense)} en ${last.name}.`,
      });
    }

    // Categoría con más gasto
    if (ctx.top && ctx.top.total > 0) {
      list.push({
        id: 'top', topic: 'top', tone: 'neutral', icon: 'tag',
        text: `Tu categoría con mayor gasto ${period} es ${ctx.top.name}: ${formatMoney(ctx.top.total)}, el ${formatPercent(ctx.top.pct, 0)} del total.`,
      });
    }

    // Peso de los gastos recurrentes
    const r = ctx.recurring;
    if (r && r.monthly > 0 && r.avgExpense > 0) {
      const share = Math.min((r.monthly / r.avgExpense) * 100, 100);
      list.push({
        id: 'recurring', topic: 'recurring', tone: share >= 50 ? 'bad' : 'neutral', icon: 'repeat',
        text: `Los gastos recurrentes representan el ${formatPercent(share, 0)} de tus gastos mensuales (${formatMoney(r.monthly)} al mes).${share >= 50 ? ' Revisa si puedes prescindir de alguna suscripción.' : ''}`,
      });
    }

    // Día de la semana con más gasto
    const w = ctx.weekday;
    if (w && w.overall > 0 && w.avg >= w.overall * 1.3) {
      list.push({
        id: 'weekday', topic: 'weekday', tone: 'neutral', icon: 'calendar',
        text: `Los ${WEEKDAYS[w.weekday]} es cuando más gastas: ${formatMoney(w.avg)} de media, frente a ${formatMoney(w.overall)} al día en general (últimos 90 días).`,
      });
    }

    // Objetivo de ahorro al ritmo actual
    const g = ctx.goal;
    if (g && g.remaining > 0 && g.avgSavings > 0) {
      const months = Math.ceil(g.remaining / g.avgSavings);
      list.push({
        id: 'goal', topic: 'goal', tone: 'good', icon: 'target',
        text: `Con tu ahorro medio de los últimos meses (${formatMoney(g.avgSavings)}/mes) podrías completar "${g.name}" en ${months === 1 ? '1 mes' : `${months} meses`}.`,
      });
    }

    return list.slice(0, MAX_ITEMS);
  }

  /**
   * Últimos meses completos y seguidos con movimientos (hasta 6), del más antiguo al más reciente.
   * Se corta en el primer mes vacío para que "N meses seguidos" sea cierto.
   */
  function completedMonths(key) {
    const currentKey = Utils.currentMonthKey();
    const end = key < currentKey ? key : Utils.addMonths(currentKey, -1);
    const months = [];
    for (let i = 0; i < 6; i++) {
      const k = Utils.addMonths(end, -i);
      const summary = Stats.monthSummary(k);
      if (!summary.count) break;
      months.unshift({ key: k, name: Alerts.monthName(k), expense: summary.expense, savings: summary.savings });
    }
    return months;
  }

  /** Consejos del mes "key" con los datos guardados */
  function forMonth(key) {
    if (key > Utils.currentMonthKey()) return [];
    const cmp = Stats.monthComparison(key);
    const months = completedMonths(key);
    const recent = months.slice(-3);
    const avg = (field) => (recent.length ? Math.round(Utils.sumBy(recent, (m) => m[field]) / recent.length) : 0);

    const categories = cmp.partial ? Stats.categoriesBetween(`${key}-01`, Utils.todayISO()) : Stats.categoriesForMonth(key);
    const top = categories[0];

    // Día de la semana: últimos 90 días hasta hoy (o hasta el final del mes elegido)
    const end = key === Utils.currentMonthKey() ? Utils.todayISO() : Utils.monthEnd(key);
    const from = Utils.addDays(end, -89);
    let weekday = null;
    if (Transactions.between(from, end).filter((t) => t.type === 'expense').length >= 15) {
      const days = Stats.weekdayExpenses(from, end);
      const best = days.reduce((max, d) => (d.avg > max.avg ? d : max), days[0]);
      const overall = Math.round(Utils.sumBy(days, (d) => d.total) / Utils.sumBy(days, (d) => d.days));
      weekday = { weekday: best.weekday, avg: best.avg, overall };
    }

    // Objetivo pendiente más cercano (por fecha; si no tienen fecha, el de más progreso)
    const pendingGoals = Goals.all()
      .map((g) => ({ goal: g, plan: Goals.progress(g) }))
      .filter((x) => !x.plan.completed)
      .sort((a, b) => (a.goal.deadline || '9999').localeCompare(b.goal.deadline || '9999') || b.plan.pct - a.plan.pct);
    const goal = pendingGoals[0]
      ? { name: pendingGoals[0].goal.name, remaining: pendingGoals[0].plan.remaining, avgSavings: avg('savings') }
      : null;

    const recurringMonthly = Utils.sumBy(Recurring.all().filter((r) => r.active), Recurring.monthlyEquivalent);

    return build({
      monthName: Alerts.monthName(key),
      prevName: Alerts.monthName(cmp.prevKey),
      partial: cmp.partial,
      top: top ? { name: top.category.name, total: top.total, pct: top.pct } : null,
      categoryChanges: Alerts.categoryChanges(cmp),
      rate: cmp.current.income > 0 && cmp.previous.income > 0 ? { current: cmp.current.rate, previous: cmp.previous.rate } : null,
      recurring: { monthly: recurringMonthly, avgExpense: avg('expense') || cmp.current.expense },
      trend: months,
      weekday,
      goal,
    });
  }

  /** Quita los consejos que repiten un tema que ya muestra un aviso */
  function withoutAlertTopics(insights, alerts) {
    const topics = new Set(alerts.map((a) => a.topic));
    return insights.filter((i) => !topics.has(i.topic));
  }

  return { build, forMonth, withoutAlertTopics };
})();
