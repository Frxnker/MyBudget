/**
 * alerts.js
 * Avisos financieros del dashboard y del informe. Se calculan al momento con los datos guardados:
 * todo funciona en el navegador, sin notificaciones externas ni correos.
 *
 * build(context) es una función pura (se prueba en tests/finance-tests.js) y forMonth(key) reúne
 * los datos reales del mes para pasárselos.
 *
 * Niveles: over (algo superado) · warn (atención) · info (recordatorio) · good (buena noticia).
 * Cada aviso lleva icono y texto: el color nunca es la única pista.
 */
const Alerts = (() => {
  const { formatMoney, formatPercent } = Utils;

  const LEVEL_ORDER = { over: 0, warn: 1, info: 2, good: 3 };

  // Umbrales (se pueden ajustar aquí)
  const BUDGET_WARN_PCT = 80;        // aviso al usar este % de un presupuesto
  const CATEGORY_SPIKE_PCT = 30;     // subida mínima de una categoría…
  const CATEGORY_SPIKE_MIN = 2000;   // …y de al menos 20 €
  const EXPENSE_DOWN_PCT = 10;       // bajada del gasto total que merece una felicitación
  const EXPENSE_UP_PCT = 20;         // subida del gasto total que merece un aviso
  const RATE_CHANGE_PTS = 5;         // cambio de la tasa de ahorro (en puntos)
  const UPCOMING_DAYS = 7;           // pagos recurrentes que se avisan con antelación

  const LINKS = {
    budget: { href: '#/presupuestos', label: 'Ver presupuestos' },
    stats: { href: '#/estadisticas', label: 'Ver estadísticas' },
    compare: { href: '#/comparar', label: 'Comparar meses' },
    recurring: { href: '#/recurrentes', label: 'Ver recurrentes' },
  };

  const lower = (text) => text.toLowerCase();
  const pct = (value) => formatPercent(Math.abs(value), 0);
  const when = (days) => (days <= 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`);

  /**
   * context = {
   *   monthName, prevName,   nombres de los meses ("octubre", "septiembre")
   *   partial,               true en el mes en curso: se compara con el mismo periodo del mes anterior
   *   future,                true si el mes aún no ha empezado (no se hacen comparaciones)
   *   monthly:    { limit, spent, pct } | null
   *   categories: [{ id, name, limit, spent, pct }]          límites por categoría
   *   plan:       Finance.budgetPlan(...) | null             solo en el mes en curso
   *   categoryChanges: [{ id, name, current, previous }]     gasto por categoría en los dos periodos
   *   expense:    { current, previous } | null
   *   rate:       { current, previous } | null               solo si los dos periodos tienen ingresos
   *   upcoming:   [{ name, amount, days }]                   pagos recurrentes pendientes
   * }
   * → [{ id, topic, level, icon, message, link }] ordenados de más a menos importante
   */
  function build(ctx) {
    const list = [];
    const add = (alert) => list.push(alert);
    // "…menos que el mes pasado a estas alturas" / "…menos que en septiembre"
    const vsPrevious = ctx.partial ? 'el mes pasado a estas alturas' : `en ${ctx.prevName}`;
    // "…respecto al mes pasado a estas alturas" / "…respecto a septiembre"
    const against = ctx.partial ? 'al mes pasado a estas alturas' : `a ${ctx.prevName}`;

    // 1. Presupuesto mensual
    const m = ctx.monthly;
    if (m && m.limit) {
      if (m.spent > m.limit) {
        add({ id: 'budget-monthly', topic: 'budget', level: 'over', icon: 'alert', link: LINKS.budget,
          message: `Has superado tu presupuesto mensual en ${formatMoney(m.spent - m.limit)}.` });
      } else if (m.pct >= BUDGET_WARN_PCT) {
        add({ id: 'budget-monthly', topic: 'budget', level: 'warn', icon: 'alert', link: LINKS.budget,
          message: `Has utilizado el ${formatPercent(m.pct, 0)} de tu presupuesto mensual.` });
      }
    }

    // 2. Límites por categoría
    (ctx.categories || []).forEach((c) => {
      if (c.spent > c.limit) {
        add({ id: `budget-${c.id}`, topic: 'budget', level: 'over', icon: 'alert', link: LINKS.budget,
          message: `Has superado tu presupuesto de ${lower(c.name)} (${formatMoney(c.spent)} de ${formatMoney(c.limit)}).` });
      } else if (c.pct >= BUDGET_WARN_PCT) {
        add({ id: `budget-${c.id}`, topic: 'budget', level: 'warn', icon: 'alert', link: LINKS.budget,
          message: `Has utilizado el ${formatPercent(c.pct, 0)} de tu presupuesto de ${lower(c.name)}.` });
      }
    });

    // 3. Ritmo de gasto por encima del recomendado
    const p = ctx.plan;
    if (p && p.status === 'fast') {
      add({ id: 'pace', topic: 'pace', level: 'warn', icon: 'clock', link: LINKS.budget,
        message: `Gastas más de lo recomendado al día (${formatMoney(p.recommendedDaily)}): a este ritmo llegarás a unos ${formatMoney(p.projected)} este mes.` });
    }

    if (!ctx.future) {
      // 4. Categorías cuyo gasto ha subido mucho (como mucho las dos que más)
      (ctx.categoryChanges || [])
        .filter((c) => c.previous > 0 && c.current - c.previous >= CATEGORY_SPIKE_MIN
          && ((c.current - c.previous) / c.previous) * 100 >= CATEGORY_SPIKE_PCT)
        .sort((a, b) => (b.current - b.previous) - (a.current - a.previous))
        .slice(0, 2)
        .forEach((c) => {
          add({ id: `spike-${c.id}`, topic: `category-${c.id}`, level: 'warn', icon: 'trendUp', link: LINKS.stats,
            message: `Tus gastos en ${lower(c.name)} han aumentado un ${pct(((c.current - c.previous) / c.previous) * 100)} respecto ${against} (${formatMoney(c.previous)} → ${formatMoney(c.current)}).` });
        });

      // 5. Gasto total frente al periodo anterior
      const e = ctx.expense;
      if (e && e.previous > 0 && (e.current > 0 || !ctx.partial)) {
        const change = ((e.current - e.previous) / e.previous) * 100;
        const subject = ctx.partial ? 'Este mes llevas gastado' : `En ${ctx.monthName} gastaste`;
        if (change <= -EXPENSE_DOWN_PCT) {
          add({ id: 'expense-change', topic: 'expense', level: 'good', icon: 'lightbulb', link: LINKS.compare,
            message: `${subject} un ${pct(change)} menos que ${vsPrevious}.` });
        } else if (change >= EXPENSE_UP_PCT) {
          add({ id: 'expense-change', topic: 'expense', level: 'warn', icon: 'trendUp', link: LINKS.compare,
            message: `${subject} un ${pct(change)} más que ${vsPrevious}.` });
        }
      }

      // 6. Tasa de ahorro
      const r = ctx.rate;
      if (r) {
        const diff = r.current - r.previous;
        const detail = `(${formatPercent(r.previous)} → ${formatPercent(r.current)})`;
        if (diff >= RATE_CHANGE_PTS) {
          add({ id: 'rate', topic: 'rate', level: 'good', icon: 'trendUp', link: LINKS.compare,
            message: `Tu tasa de ahorro ha mejorado ${diff.toFixed(1).replace('.', ',')} puntos respecto ${against} ${detail}.` });
        } else if (diff <= -RATE_CHANGE_PTS) {
          add({ id: 'rate', topic: 'rate', level: 'warn', icon: 'trendDown', link: LINKS.compare,
            message: `Tu tasa de ahorro ha empeorado ${Math.abs(diff).toFixed(1).replace('.', ',')} puntos respecto ${against} ${detail}.` });
        }
      }
    }

    // 7. Pagos recurrentes próximos
    const upcoming = ctx.upcoming || [];
    if (upcoming.length === 1) {
      const [u] = upcoming;
      add({ id: 'upcoming', topic: 'upcoming', level: 'info', icon: 'calendar', link: LINKS.recurring,
        message: `Tienes un pago recurrente de ${formatMoney(u.amount)} (${u.name}) ${when(u.days)}.` });
    } else if (upcoming.length > 1) {
      const total = upcoming.reduce((sum, u) => sum + u.amount, 0);
      const names = upcoming.slice(0, 3).map((u) => u.name).join(', ') + (upcoming.length > 3 ? '…' : '');
      add({ id: 'upcoming', topic: 'upcoming', level: 'info', icon: 'calendar', link: LINKS.recurring,
        message: `Tienes ${upcoming.length} pagos recurrentes en los próximos ${UPCOMING_DAYS} días por ${formatMoney(total)} (${names}).` });
    }

    // sort es estable: dentro de cada nivel se mantiene el orden anterior
    return list.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  }

  /** Nombre del mes en minúsculas: "2026-10" → "octubre" */
  const monthName = (key) => Utils.monthLabel(key).split(' ')[0].toLowerCase();

  /**
   * Gasto por categoría en el periodo del mes y en el anterior comparable
   * (ver Stats.monthComparison): [{ id, name, current, previous }]
   */
  function categoryChanges(cmp) {
    const current = cmp.partial ? Stats.categoriesBetween(`${cmp.key}-01`, Utils.todayISO()) : Stats.categoriesForMonth(cmp.key);
    const previous = cmp.partial ? Stats.categoriesBetween(`${cmp.prevKey}-01`, cmp.prevEnd) : Stats.categoriesForMonth(cmp.prevKey);
    return current.map((c) => ({
      id: c.categoryId,
      name: c.category.name,
      current: c.total,
      previous: (previous.find((p) => p.categoryId === c.categoryId) || { total: 0 }).total,
    }));
  }

  /** Avisos del mes "key" con los datos guardados */
  function forMonth(key) {
    const currentKey = Utils.currentMonthKey();
    const cmp = Stats.monthComparison(key);
    const monthly = Budget.monthlyStatus(key);
    return build({
      monthName: monthName(key),
      prevName: monthName(cmp.prevKey),
      partial: cmp.partial,
      future: key > currentKey,
      monthly: monthly.limit ? monthly : null,
      categories: Budget.categoryStatuses(key).map((s) => ({
        id: s.categoryId, name: s.category.name, limit: s.limit, spent: s.spent, pct: s.pct,
      })),
      plan: Budget.plan(key),
      categoryChanges: categoryChanges(cmp),
      expense: { current: cmp.current.expense, previous: cmp.previous.expense },
      rate: cmp.current.income > 0 && cmp.previous.income > 0 ? { current: cmp.current.rate, previous: cmp.previous.rate } : null,
      upcoming: key === currentKey
        ? Recurring.upcoming(UPCOMING_DAYS).map((o) => ({ name: o.item.name, amount: o.item.amount, days: Utils.daysUntil(o.date) }))
        : [],
    });
  }

  return { build, forMonth, categoryChanges, monthName, UPCOMING_DAYS };
})();
