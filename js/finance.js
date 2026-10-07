/**
 * finance.js
 * Cálculos financieros puros: reciben números o listas y devuelven resultados.
 * No leen LocalStorage ni tocan el DOM, así que se pueden probar de forma aislada
 * (tests/finance-tests.js). Todas las cantidades van en céntimos.
 *
 * Los módulos con datos (Stats, Budget, Recurring, Goals…) reúnen la información y llaman a estas funciones.
 */
const Finance = (() => {
  const { percent, clamp, addDays, daysBetween, monthDiff, monthKey, monthEnd, addMonths } = Utils;

  /* ---------------------------------------------------------------
   * COMPARACIONES
   * ------------------------------------------------------------- */

  /**
   * Compara un valor con el anterior. "pct" es null si no hay referencia (anterior = 0):
   * pasar de 0 € a 50 € no tiene un porcentaje con sentido.
   */
  function compare(current, previous) {
    const diff = current - previous;
    return {
      current,
      previous,
      diff,
      pct: previous ? (diff / Math.abs(previous)) * 100 : null,
      direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same',
    };
  }

  /** Porcentaje de los ingresos que se ha ahorrado (0 si no hay ingresos) */
  function savingsRate(income, expense) {
    return income > 0 ? ((income - expense) / income) * 100 : 0;
  }

  /**
   * Compara dos repartos por categoría ([{ categoryId, category, total }]): "before" es el mes base
   * y "after" el comparado. Devuelve una fila por categoría presente en cualquiera de los dos,
   * ordenadas por el mayor importe: [{ categoryId, category, a, b, diff, pct, direction }]
   */
  function compareCategories(before, after) {
    const rows = new Map();
    const row = (item) => {
      if (!rows.has(item.categoryId)) {
        rows.set(item.categoryId, { categoryId: item.categoryId, category: item.category, a: 0, b: 0 });
      }
      return rows.get(item.categoryId);
    };
    before.forEach((item) => { row(item).a = item.total; });
    after.forEach((item) => { row(item).b = item.total; });
    return [...rows.values()]
      .map((r) => {
        const { diff, pct, direction } = compare(r.b, r.a);
        return { ...r, diff, pct, direction };
      })
      .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
  }

  /* ---------------------------------------------------------------
   * PRESUPUESTO INTELIGENTE
   * ------------------------------------------------------------- */

  /**
   * Seguimiento del presupuesto mensual en el mes en curso.
   *  - limit, spent: presupuesto y gasto del mes
   *  - daysInMonth, day: días del mes y día de hoy (0 si el mes aún no ha empezado)
   *  - fixedSpent: parte de "spent" que son pagos recurrentes (alquiler, suscripciones…)
   *  - pendingFixed: pagos recurrentes que faltan por cobrar este mes
   *
   * La previsión separa los gastos fijos de los variables: los fijos se suman tal cual y solo los
   * variables se extrapolan al resto del mes. Así el alquiler del día 1 no hace creer que se va a
   * gastar 30 veces esa cantidad.
   */
  function budgetPlan({ limit, spent, daysInMonth, day, fixedSpent = 0, pendingFixed = 0 }) {
    const remaining = limit - spent;
    // Incluye hoy. Si el mes aún no ha empezado (day = 0), quedan todos sus días
    const daysLeft = day > 0 ? Math.max(daysInMonth - day + 1, 1) : daysInMonth;
    // Lo que queda para gastos del día a día después de reservar los recurrentes pendientes
    const free = Math.max(remaining - pendingFixed, 0);
    const variableSpent = Math.max(spent - fixedSpent, 0);
    const variableDaily = day > 0 ? variableSpent / day : 0;
    const projected = Math.round(spent + pendingFixed + variableDaily * (daysInMonth - day));

    let status = 'ok';
    if (spent > limit) status = 'over';
    else if (projected > limit) status = 'fast';

    return {
      limit,
      spent,
      remaining,
      pct: percent(spent, limit),
      daysLeft,
      recommendedDaily: Math.round(free / daysLeft),
      avgDaily: Math.round(variableDaily),
      idealDaily: Math.round(limit / daysInMonth),
      idealToDate: Math.round((limit * day) / daysInMonth),
      projected,
      pendingFixed,
      status,
    };
  }

  /* ---------------------------------------------------------------
   * DINERO DISPONIBLE
   * ------------------------------------------------------------- */

  /** Saldo menos los pagos pendientes (lista de importes). No modifica el saldo real. */
  function availableMoney(balance, payments) {
    const pending = payments.reduce((sum, amount) => sum + amount, 0);
    return { balance, pending, available: balance - pending, count: payments.length };
  }

  /* ---------------------------------------------------------------
   * OBJETIVOS DE AHORRO
   * ------------------------------------------------------------- */

  /**
   * Plan de un objetivo a fecha "today" (ISO).
   * El ritmo esperado es lineal: desde lo que había ahorrado al crearlo (startSaved, en createdAt)
   * hasta la cantidad objetivo en la fecha límite. Si se ha ahorrado al menos lo esperado
   * (con un margen del 1 %), el objetivo va al día.
   *
   * status: completed | no-deadline | on-track | behind | overdue
   */
  function goalPlan(goal, today) {
    const { target, saved } = goal;
    const remaining = Math.max(target - saved, 0);
    const completed = saved >= target;
    const plan = {
      pct: percent(saved, target),
      remaining,
      completed,
      daysLeft: null,
      monthsLeft: null,
      weeksLeft: null,
      monthlyNeeded: null,
      weeklyNeeded: null,
      expected: null,
      expectedPct: null,
      shortfall: 0,
      status: completed ? 'completed' : (goal.deadline ? 'on-track' : 'no-deadline'),
    };
    if (completed || !goal.deadline) return plan;

    plan.daysLeft = daysBetween(today, goal.deadline);
    if (plan.daysLeft < 0) {
      plan.status = 'overdue';
      return plan;
    }

    // Meses: los que quedan hasta el de la fecha límite (si es este mes, hay que ahorrarlo todo ya)
    plan.monthsLeft = monthDiff(monthKey(today), monthKey(goal.deadline));
    plan.monthlyNeeded = plan.monthsLeft > 0 ? Math.ceil(remaining / plan.monthsLeft) : remaining;
    plan.weeksLeft = Math.max(Math.ceil(plan.daysLeft / 7), 1);
    plan.weeklyNeeded = Math.ceil(remaining / plan.weeksLeft);

    const start = goal.createdAt ? Utils.toISODate(new Date(goal.createdAt)) : today;
    const total = daysBetween(start, goal.deadline);
    if (total > 0) {
      const base = clamp(goal.startSaved || 0, 0, target);
      const elapsed = clamp(daysBetween(start, today) / total, 0, 1);
      plan.expected = Math.round(base + (target - base) * elapsed);
      plan.expectedPct = percent(plan.expected, target);
      plan.shortfall = Math.max(plan.expected - saved, 0);
      plan.status = plan.shortfall <= Math.max(100, Math.round(target * 0.01)) ? 'on-track' : 'behind';
    }
    return plan;
  }

  /* ---------------------------------------------------------------
   * EVOLUCIÓN (gráfica con selector de periodo)
   * ------------------------------------------------------------- */

  const RANGES = {
    '7d': { unit: 'day', count: 7, label: '7 días', short: '7D' },
    '30d': { unit: 'day', count: 30, label: '30 días', short: '30D' },
    '3m': { unit: 'week', count: 13, label: '3 meses', short: '3M' },
    '6m': { unit: 'month', count: 6, label: '6 meses', short: '6M' },
    '1y': { unit: 'month', count: 12, label: '1 año', short: '1A' },
  };

  /**
   * Tramos de un periodo que termina en "end" (ISO): días, semanas de 7 días o meses naturales.
   * El último tramo nunca pasa de "end".
   */
  function timelineBuckets(range, end) {
    const { unit, count } = RANGES[range] || RANGES['6m'];
    const buckets = [];
    for (let i = count - 1; i >= 0; i--) {
      if (unit === 'day') {
        const day = addDays(end, -i);
        buckets.push({ unit, start: day, end: day });
      } else if (unit === 'week') {
        const last = addDays(end, -7 * i);
        buckets.push({ unit, start: addDays(last, -6), end: last });
      } else {
        const key = addMonths(monthKey(end), -i);
        const last = monthEnd(key);
        buckets.push({ unit, start: `${key}-01`, end: last < end ? last : end });
      }
    }
    return buckets;
  }

  /**
   * Ingresos, gastos y saldo acumulado al final de cada tramo.
   * El saldo incluye todo lo anterior al periodo; los movimientos posteriores a "end" no cuentan.
   */
  function timeline(transactions, range, end) {
    const buckets = timelineBuckets(range, end).map((b) => ({ ...b, income: 0, expense: 0, count: 0, balance: 0 }));
    const first = buckets[0].start;
    let opening = 0;

    transactions.forEach((t) => {
      if (t.date > end) return;
      if (t.date < first) {
        opening += t.type === 'income' ? t.amount : -t.amount;
        return;
      }
      // Búsqueda binaria del tramo que contiene la fecha
      let lo = 0;
      let hi = buckets.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (buckets[mid].start <= t.date) lo = mid;
        else hi = mid - 1;
      }
      buckets[lo][t.type] += t.amount;
      buckets[lo].count += 1;
    });

    let running = opening;
    buckets.forEach((b) => {
      running += b.income - b.expense;
      b.balance = running;
    });
    return buckets;
  }

  /* ---------------------------------------------------------------
   * PAGOS RECURRENTES
   * ------------------------------------------------------------- */

  /**
   * Empareja los cobros previstos de los gastos recurrentes con los gastos ya registrados.
   * Un cobro cuenta como pagado si en su mismo mes hay:
   *   1. un gasto enlazado con ese recurrente (recurringId, lo añade "Registrar pago"), o si no,
   *   2. un gasto sin enlazar de la misma categoría y exactamente el mismo importe.
   * Cada gasto solo puede pagar un cobro.
   *
   *  occurrences: [{ item, date }]   expenses: movimientos de tipo gasto
   *  → { paid: Set de "idRecurrente|fecha", matched: Set de ids de movimientos }
   */
  function matchRecurring(occurrences, expenses) {
    const paid = new Set();
    const matched = new Set();
    const byMonth = new Map();
    expenses.forEach((t) => {
      const key = t.date.slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(t);
    });

    const keyOf = (o) => `${o.item.id}|${o.date}`;
    const tryMatch = (o, test) => {
      if (paid.has(keyOf(o))) return;
      const tx = (byMonth.get(o.date.slice(0, 7)) || []).find((t) => !matched.has(t.id) && test(t));
      if (!tx) return;
      matched.add(tx.id);
      paid.add(keyOf(o));
    };

    occurrences.forEach((o) => tryMatch(o, (t) => t.recurringId === o.item.id));
    occurrences.forEach((o) => tryMatch(o, (t) => !t.recurringId
      && t.categoryId === o.item.categoryId && t.amount === o.item.amount));
    return { paid, matched };
  }

  return {
    RANGES, compare, savingsRate, compareCategories, budgetPlan, availableMoney, goalPlan,
    timelineBuckets, timeline, matchRecurring,
  };
})();
