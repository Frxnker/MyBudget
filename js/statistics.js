/**
 * statistics.js
 * Cálculos financieros puros (no tocan el DOM). Todas las cantidades en céntimos.
 */
const Stats = (() => {
  const { sumBy, addMonths, todayISO, daysInMonth, currentMonthKey, monthEnd, percent } = Utils;

  const sumType = (list, type) => sumBy(list.filter((t) => t.type === type), (t) => t.amount);

  /*
   * Memoria de resultados. Las vistas piden los mismos cálculos varias veces en cada pintado
   * (KPIs, avisos, consejos, presupuesto…). Store sustituye la lista de movimientos completa en cada
   * cambio, así que basta con comparar referencias para saber si los resultados siguen siendo válidos.
   * También dependen de las categorías (nombres y colores) y del día de hoy.
   * Los resultados son de solo lectura: no hay que modificarlos.
   */
  let memoList = null;
  let memoCategories = null;
  let memoDay = '';
  let memo = new Map();

  function cached(key, compute) {
    const list = Transactions.all();
    const categories = Categories.all();
    const day = todayISO();
    if (list !== memoList || categories !== memoCategories || day !== memoDay) {
      memo = new Map();
      memoList = list;
      memoCategories = categories;
      memoDay = day;
    }
    if (!memo.has(key)) memo.set(key, compute());
    return memo.get(key);
  }

  /** Variación porcentual respecto a un valor anterior (null si no hay referencia) */
  function change(current, previous) {
    if (!previous) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  /** Ingresos, gastos y ahorro de una lista de movimientos */
  function summarize(list) {
    const income = sumType(list, 'income');
    const expense = sumType(list, 'expense');
    const savings = income - expense;
    return { income, expense, savings, rate: income > 0 ? (savings / income) * 100 : 0, count: list.length };
  }

  function monthSummary(key) {
    return cached(`month:${key}`, () => summarize(Transactions.forMonth(key)));
  }

  /** Resumen de los movimientos entre dos fechas ISO (ambas incluidas) */
  function periodSummary(from, to) {
    return cached(`period:${from}:${to}`, () => summarize(Transactions.between(from, to)));
  }

  /** Saldo acumulado: todos los ingresos menos todos los gastos hasta hoy */
  function balance() {
    return cached('balance', () => {
      const today = todayISO();
      const list = Transactions.all().filter((t) => t.date <= today);
      return sumType(list, 'income') - sumType(list, 'expense');
    });
  }

  /**
   * Saldo acumulado al cierre de cada uno de los últimos "count" meses (el actual, hasta hoy).
   * El último valor coincide con balance(). Se usa en la mini gráfica del dashboard.
   */
  function balanceHistory(count = 6) {
    const today = todayISO();
    const startKey = addMonths(currentMonthKey(), -(count - 1));
    const signed = (t) => (t.type === 'income' ? t.amount : -t.amount);
    let running = sumBy(Transactions.all().filter((t) => t.date < `${startKey}-01`), signed);
    const result = [];
    for (let i = 0; i < count; i++) {
      const key = addMonths(startKey, i);
      running += sumBy(Transactions.forMonth(key).filter((t) => t.date <= today), signed);
      result.push({ key, balance: running });
    }
    return result;
  }

  /** Comparativa con el mes anterior */
  function monthTrends(key) {
    const current = monthSummary(key);
    const previous = monthSummary(addMonths(key, -1));
    return {
      income: change(current.income, previous.income),
      expense: change(current.expense, previous.expense),
      savings: change(current.savings, previous.savings),
      rate: previous.income > 0 ? current.rate - previous.rate : null,
    };
  }

  /** Agrupa gastos por categoría: [{ category, total, pct }] ordenado de mayor a menor */
  function byCategory(expenses) {
    const totals = {};
    expenses.forEach((t) => { totals[t.categoryId] = (totals[t.categoryId] || 0) + t.amount; });
    const grand = sumBy(Object.values(totals), (v) => v);
    return Object.entries(totals)
      .map(([id, total]) => ({ category: Categories.get(id), categoryId: id, total, pct: Utils.percent(total, grand) }))
      .sort((a, b) => b.total - a.total);
  }

  function categoriesForMonth(key) {
    return cached(`categories:${key}`, () => byCategory(Transactions.forMonth(key, 'expense')));
  }

  /** Ingresos de un mes agrupados por categoría */
  function incomeByCategory(key) {
    return cached(`income-categories:${key}`, () => byCategory(Transactions.forMonth(key, 'income')));
  }

  /** Gastos (o ingresos) por categoría entre dos fechas */
  function categoriesBetween(from, to, type = 'expense') {
    return cached(`categories:${from}:${to}:${type}`,
      () => byCategory(Transactions.between(from, to).filter((t) => t.type === type)));
  }

  /**
   * Mes comparado con el anterior. En el mes en curso (aún sin terminar) se compara con el mismo
   * periodo del mes anterior: del 1 al 7 de octubre frente al 1 al 7 de septiembre. Comparar unos
   * pocos días con un mes completo daría siempre la impresión de que se gasta mucho menos.
   */
  function monthComparison(key) {
    const prevKey = addMonths(key, -1);
    if (key !== currentMonthKey()) {
      return { key, prevKey, partial: false, current: monthSummary(key), previous: monthSummary(prevKey), prevEnd: monthEnd(prevKey) };
    }
    const today = todayISO();
    const day = Number(today.slice(8, 10));
    const prevEnd = `${prevKey}-${String(Math.min(day, daysInMonth(prevKey))).padStart(2, '0')}`;
    return {
      key,
      prevKey,
      partial: true,
      day,
      current: periodSummary(`${key}-01`, today),
      previous: periodSummary(`${prevKey}-01`, prevEnd),
      prevEnd,
    };
  }

  /** Media mensual de un campo (income, expense, savings) en los "count" meses que terminan en "endKey" */
  function averageMonthly(endKey, count, field) {
    let total = 0;
    for (let i = 0; i < count; i++) total += monthSummary(addMonths(endKey, -i))[field];
    return Math.round(total / count);
  }

  /** Categorías con más gasto del mes, comparadas con el mes anterior */
  function topCategories(key, limit = 5) {
    const previous = categoriesForMonth(addMonths(key, -1));
    return categoriesForMonth(key).slice(0, limit).map((item) => {
      const prev = previous.find((p) => p.categoryId === item.categoryId);
      return { ...item, previous: prev ? prev.total : 0, change: change(item.total, prev ? prev.total : 0) };
    });
  }

  /** Gasto de una categoría en un mes */
  function categorySpent(key, categoryId) {
    return sumBy(Transactions.forMonth(key, 'expense').filter((t) => t.categoryId === categoryId), (t) => t.amount);
  }

  /** Gasto de cada día del mes: [12.5, 0, 30, …] en céntimos */
  function dailyExpenses(key) {
    const days = new Array(daysInMonth(key)).fill(0);
    Transactions.forMonth(key, 'expense').forEach((t) => {
      days[Number(t.date.slice(8, 10)) - 1] += t.amount;
    });
    return days;
  }

  /** Ingresos, gastos y ahorro de los últimos "count" meses terminando en "endKey" */
  function evolution(endKey, count = 6) {
    const result = [];
    for (let i = count - 1; i >= 0; i--) {
      const key = addMonths(endKey, -i);
      result.push({ key, ...monthSummary(key) });
    }
    return result;
  }

  /** Días transcurridos de un periodo (para las medias): pasado = completo, futuro = 0 */
  function elapsedDaysInMonth(key) {
    const current = currentMonthKey();
    if (key < current) return daysInMonth(key);
    if (key > current) return 0;
    return new Date().getDate();
  }

  function elapsedDaysInYear(year) {
    const now = new Date();
    if (year < now.getFullYear()) return (new Date(year, 11, 31) - new Date(year, 0, 1)) / 86400000 + 1;
    if (year > now.getFullYear()) return 0;
    return Math.round((new Date(year, now.getMonth(), now.getDate()) - new Date(year, 0, 1)) / 86400000) + 1;
  }

  function elapsedMonthsInYear(year) {
    const now = new Date();
    if (year < now.getFullYear()) return 12;
    if (year > now.getFullYear()) return 0;
    return now.getMonth() + 1;
  }

  /** Estadísticas del mes seleccionado */
  function monthStats(key) {
    const summary = monthSummary(key);
    const elapsed = elapsedDaysInMonth(key);
    const daily = dailyExpenses(key);
    const maxValue = Math.max(0, ...daily);
    return {
      ...summary,
      avgDaily: elapsed ? Math.round(summary.expense / elapsed) : 0,
      maxDay: maxValue ? { date: `${key}-${String(daily.indexOf(maxValue) + 1).padStart(2, '0')}`, total: maxValue } : null,
    };
  }

  /** Estadísticas anuales */
  function yearStats(year) {
    const list = Transactions.all().filter((t) => t.date.startsWith(`${year}-`));
    const expenses = list.filter((t) => t.type === 'expense');
    const summary = summarize(list);

    const elapsedDays = elapsedDaysInYear(year);
    const elapsedMonths = elapsedMonthsInYear(year);

    const biggest = expenses.reduce((max, t) => (!max || t.amount > max.amount ? t : max), null);

    const perDay = {};
    expenses.forEach((t) => { perDay[t.date] = (perDay[t.date] || 0) + t.amount; });
    const maxDay = Object.entries(perDay).reduce((max, [date, total]) => (!max || total > max.total ? { date, total } : max), null);

    return {
      ...summary,
      avgDaily: elapsedDays ? Math.round(summary.expense / elapsedDays) : 0,
      avgMonthly: elapsedMonths ? Math.round(summary.expense / elapsedMonths) : 0,
      topCategory: byCategory(expenses)[0] || null,
      biggest,
      maxDay,
    };
  }

  /** Resumen mes a mes de un año */
  function yearSummary(year) {
    return Array.from({ length: 12 }, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}`;
      return { key, ...monthSummary(key) };
    });
  }

  /**
   * Comparación completa entre dos meses: "a" es el mes base y "b" el comparado.
   * Las diferencias se calculan de a → b.
   */
  function compareMonths(a, b) {
    const sa = monthStats(a);
    const sb = monthStats(b);
    const metric = (id, label, field, goodWhenUp, kind = 'money') => ({
      id, label, kind, goodWhenUp, a: sa[field], b: sb[field], ...Finance.compare(sb[field], sa[field]),
    });
    // La tasa de ahorro solo tiene sentido si hubo ingresos; su diferencia se expresa en puntos
    const rateA = sa.income > 0 ? sa.rate : null;
    const rateB = sb.income > 0 ? sb.rate : null;
    return {
      a: { key: a, ...sa },
      b: { key: b, ...sb },
      metrics: [
        metric('income', 'Ingresos', 'income', true),
        metric('expense', 'Gastos', 'expense', false),
        metric('savings', 'Ahorro', 'savings', true),
        {
          id: 'rate', label: 'Tasa de ahorro', kind: 'points', goodWhenUp: true, a: rateA, b: rateB,
          diff: rateA !== null && rateB !== null ? rateB - rateA : null, pct: null,
        },
        metric('count', 'Movimientos', 'count', null, 'count'),
        metric('avgDaily', 'Gasto medio diario', 'avgDaily', false),
      ],
      expenses: Finance.compareCategories(categoriesForMonth(a), categoriesForMonth(b)),
      incomes: Finance.compareCategories(incomeByCategory(a), incomeByCategory(b)),
    };
  }

  /** Estadísticas de una categoría en el mes "key" y en los 5 meses anteriores */
  function categoryDetail(categoryId, key) {
    const category = Categories.get(categoryId);
    const all = Transactions.all().filter((t) => t.categoryId === categoryId);
    const monthTotal = (k) => sumBy(Transactions.forMonth(k).filter((t) => t.categoryId === categoryId), (t) => t.amount);
    const history = Array.from({ length: 6 }, (_, i) => {
      const k = addMonths(key, i - 5);
      return { key: k, total: monthTotal(k) };
    });
    const current = history[5].total;
    const previous = history[4].total;
    const typeTotal = monthSummary(key)[category.type];
    const last = all.reduce((latest, t) => (!latest || t.date > latest.date ? t : latest), null);
    return {
      category,
      key,
      current,
      previous,
      change: change(current, previous),
      share: percent(current, typeTotal),
      average: Math.round(sumBy(history, (h) => h.total) / history.length),
      history,
      monthCount: Transactions.forMonth(key).filter((t) => t.categoryId === categoryId).length,
      count: all.length,
      total: sumBy(all, (t) => t.amount),
      last,
    };
  }

  /** Evolución de ingresos, gastos y saldo en el periodo que termina en "end" (ver Finance.timeline) */
  function timeline(range, end) {
    return cached(`timeline:${range}:${end}`, () => Finance.timeline(Transactions.all(), range, end));
  }

  /**
   * Gasto medio de cada día de la semana entre dos fechas: [{ weekday (0 = lunes), avg, total, days }].
   * La media se calcula sobre todos los lunes (martes…) del periodo, también los que no tuvieron gastos.
   */
  function weekdayExpenses(from, to) {
    const result = Array.from({ length: 7 }, (_, weekday) => ({ weekday, total: 0, days: 0, avg: 0 }));
    for (let day = from; day <= to; day = Utils.addDays(day, 1)) {
      result[(Utils.parseISODate(day).getDay() + 6) % 7].days += 1;
    }
    Transactions.between(from, to).filter((t) => t.type === 'expense').forEach((t) => {
      result[(Utils.parseISODate(t.date).getDay() + 6) % 7].total += t.amount;
    });
    result.forEach((r) => { r.avg = r.days ? Math.round(r.total / r.days) : 0; });
    return result;
  }

  return {
    change, summarize, monthSummary, periodSummary, balance, balanceHistory, monthTrends, monthComparison,
    byCategory, categoriesForMonth, incomeByCategory, categoriesBetween, topCategories, categorySpent,
    dailyExpenses, evolution, averageMonthly, elapsedDaysInMonth, monthStats, yearStats, yearSummary,
    compareMonths, categoryDetail, timeline, weekdayExpenses,
  };
})();
