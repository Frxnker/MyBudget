/**
 * statistics.js
 * Cálculos financieros puros (no tocan el DOM). Todas las cantidades en céntimos.
 */
const Stats = (() => {
  const { sumBy, addMonths, todayISO, daysInMonth, currentMonthKey } = Utils;

  const sumType = (list, type) => sumBy(list.filter((t) => t.type === type), (t) => t.amount);

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
    return summarize(Transactions.forMonth(key));
  }

  /** Saldo acumulado: todos los ingresos menos todos los gastos hasta hoy */
  function balance() {
    const today = todayISO();
    const list = Transactions.all().filter((t) => t.date <= today);
    return sumType(list, 'income') - sumType(list, 'expense');
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
    return byCategory(Transactions.forMonth(key, 'expense'));
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

  return {
    change, summarize, monthSummary, balance, balanceHistory, monthTrends, byCategory, categoriesForMonth,
    topCategories, categorySpent, dailyExpenses, evolution, elapsedDaysInMonth, monthStats, yearStats, yearSummary,
  };
})();
