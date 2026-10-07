/**
 * demo.js
 * Datos de ejemplo que se cargan la primera vez que se abre la aplicación.
 * Las fechas se calculan respecto a hoy para que el dashboard siempre tenga contenido.
 * Cada registro lleva "demo: true" para poder borrar solo los ejemplos más tarde.
 */
const Demo = (() => {
  const { addMonths, currentMonthKey, daysInMonth, uid } = Utils;

  const DEMO_BUDGET = {
    monthly: 130000,
    byCategory: { 'exp-alimentacion': 30000, 'exp-transporte': 15000, 'exp-ocio': 10000 },
  };

  /** Fecha del mes actual + "offset" (nunca posterior a hoy en el mes actual) */
  function dateIn(offset, day) {
    const key = addMonths(currentMonthKey(), offset);
    let d = Math.min(day, daysInMonth(key));
    if (offset === 0) d = Math.min(d, new Date().getDate());
    return `${key}-${String(d).padStart(2, '0')}`;
  }

  function tx(type, concept, euros, categoryId, offset, day, method, notes = '') {
    return {
      id: uid('tx'), type, concept, amount: Math.round(euros * 100), categoryId,
      date: dateIn(offset, day), method, notes, createdAt: Date.now(), demo: true,
    };
  }

  const income = (...args) => tx('income', ...args);
  const expense = (...args) => tx('expense', ...args);

  /** Gastos fijos que se repiten cada mes */
  function fixedExpenses(offset) {
    return [
      expense('Alquiler piso', 650, 'exp-vivienda', offset, 1, 'Domiciliación'),
      expense('Gimnasio', 35, 'exp-salud', offset, 1, 'Domiciliación'),
      expense('Spotify', 10.99, 'exp-suscripciones', offset, 5, 'Tarjeta de crédito'),
    ];
  }

  function transactions() {
    return [
      // Mes actual
      income('Nómina', 1800, 'inc-salario', 0, 1, 'Nómina'),
      ...fixedExpenses(0),
      expense('Supermercado', 86.4, 'exp-alimentacion', 0, 2, 'Tarjeta de débito', 'Compra semanal'),
      expense('Abono transporte', 20, 'exp-transporte', 0, 2, 'Tarjeta de débito'),
      expense('Farmacia', 12.8, 'exp-salud', 0, 3, 'Efectivo'),
      expense('Entradas concierto', 65, 'exp-ocio', 0, 4, 'Tarjeta de crédito'),
      expense('Cena con amigos', 38.5, 'exp-ocio', 0, 5, 'Bizum'),
      expense('Gasolina', 45, 'exp-transporte', 0, 6, 'Tarjeta de débito'),

      // Mes anterior
      income('Nómina', 1800, 'inc-salario', -1, 1, 'Nómina'),
      income('Proyecto web freelance', 350, 'inc-freelance', -1, 18, 'Transferencia'),
      ...fixedExpenses(-1),
      expense('Supermercado', 92.3, 'exp-alimentacion', -1, 5, 'Tarjeta de débito'),
      expense('Gasolina', 50, 'exp-transporte', -1, 10, 'Tarjeta de débito'),
      expense('Cine', 18, 'exp-ocio', -1, 12, 'Tarjeta de débito'),
      expense('Netflix', 12.99, 'exp-suscripciones', -1, 15, 'Tarjeta de crédito'),
      expense('Supermercado', 64.15, 'exp-alimentacion', -1, 19, 'Tarjeta de débito'),
      expense('Internet fibra', 39.9, 'exp-vivienda', -1, 20, 'Domiciliación'),
      expense('Ropa de otoño', 79.95, 'exp-compras', -1, 21, 'Tarjeta de crédito'),
      expense('Curso de JavaScript', 14.99, 'exp-educacion', -1, 25, 'PayPal'),

      // Hace dos meses
      income('Nómina', 1800, 'inc-salario', -2, 1, 'Nómina'),
      income('Regalo de cumpleaños', 50, 'inc-regalos', -2, 14, 'Efectivo'),
      ...fixedExpenses(-2),
      expense('Supermercado', 110.2, 'exp-alimentacion', -2, 4, 'Tarjeta de débito'),
      expense('Gasolina', 48, 'exp-transporte', -2, 9, 'Tarjeta de débito'),
      expense('Netflix', 12.99, 'exp-suscripciones', -2, 15, 'Tarjeta de crédito'),
      expense('Supermercado', 71.4, 'exp-alimentacion', -2, 18, 'Tarjeta de débito'),
      expense('Internet fibra', 39.9, 'exp-vivienda', -2, 20, 'Domiciliación'),
      expense('Escapada fin de semana', 180, 'exp-viajes', -2, 22, 'Tarjeta de crédito'),
      expense('Cena de cumpleaños', 42, 'exp-ocio', -2, 14, 'Efectivo'),

      // Hace tres meses
      income('Nómina', 1800, 'inc-salario', -3, 1, 'Nómina'),
      ...fixedExpenses(-3),
      expense('Supermercado', 98.6, 'exp-alimentacion', -3, 6, 'Tarjeta de débito'),
      expense('Gasolina', 40, 'exp-transporte', -3, 11, 'Tarjeta de débito'),
      expense('Netflix', 12.99, 'exp-suscripciones', -3, 15, 'Tarjeta de crédito'),
      expense('Pedido online', 45.99, 'exp-compras', -3, 17, 'PayPal'),
      expense('Internet fibra', 39.9, 'exp-vivienda', -3, 20, 'Domiciliación'),
      expense('Dentista', 60, 'exp-salud', -3, 24, 'Tarjeta de débito'),
    ];
  }

  function recurring() {
    const start = addMonths(currentMonthKey(), -3);
    const rec = (name, euros, categoryId, day, frequency, startMonth, method) => ({
      id: uid('rec'), name, amount: Math.round(euros * 100), categoryId, day, frequency, startMonth, method, active: true, demo: true,
    });
    return [
      rec('Alquiler', 650, 'exp-vivienda', 1, 'monthly', start, 'Domiciliación'),
      rec('Netflix', 12.99, 'exp-suscripciones', 15, 'monthly', start, 'Tarjeta de crédito'),
      rec('Spotify', 10.99, 'exp-suscripciones', 5, 'monthly', start, 'Tarjeta de crédito'),
      rec('Gimnasio', 35, 'exp-salud', 1, 'monthly', start, 'Domiciliación'),
      rec('Internet fibra', 39.9, 'exp-vivienda', 20, 'monthly', start, 'Domiciliación'),
      rec('Seguro del coche', 380, 'exp-transporte', 10, 'yearly', addMonths(currentMonthKey(), -10), 'Domiciliación'),
    ];
  }

  function goals() {
    const monthStart = (offset) => `${addMonths(currentMonthKey(), offset)}-01`;
    // Fecha de creación "hace N meses": con ella se mide si cada objetivo va al ritmo necesario
    const createdMonthsAgo = (months) => Utils.parseISODate(monthStart(-months)).getTime();
    const goal = (name, icon, target, saved, dl = '', monthsAgo = 0) => ({
      id: uid('goal'), name, icon, target: target * 100, saved: saved * 100, startSaved: 0, deadline: dl,
      createdAt: monthsAgo ? createdMonthsAgo(monthsAgo) : Date.now(), demo: true,
    });
    return [
      goal('Viaje a Japón', '🗾', 2000, 850, monthStart(8), 4),        // va al día
      goal('Fondo de emergencia', '🛟', 3000, 1200, monthStart(4), 8), // va por detrás
      goal('Portátil nuevo', '💻', 900, 900),                         // completado
    ];
  }

  /** Añade los datos de ejemplo (sin borrar los existentes) */
  function load() {
    const budgets = Store.get('budgets');
    const byCategory = { ...budgets.byCategory };
    Object.entries(DEMO_BUDGET.byCategory).forEach(([id, value]) => {
      if (!byCategory[id]) byCategory[id] = value;
    });
    Store.setMany({
      transactions: [...Store.get('transactions'), ...transactions()],
      recurring: [...Store.get('recurring'), ...recurring()],
      goals: [...Store.get('goals'), ...goals()],
      budgets: { monthly: budgets.monthly || DEMO_BUDGET.monthly, byCategory },
      settings: { ...Store.get('settings'), demoLoaded: true, demoBannerHidden: false },
    });
  }

  /** Elimina solo los registros de ejemplo */
  function clear() {
    const budgets = Store.get('budgets');
    const byCategory = { ...budgets.byCategory };
    Object.entries(DEMO_BUDGET.byCategory).forEach(([id, value]) => {
      if (byCategory[id] === value) delete byCategory[id];
    });
    const notDemo = (item) => !item.demo;
    Store.setMany({
      transactions: Store.get('transactions').filter(notDemo),
      recurring: Store.get('recurring').filter(notDemo),
      goals: Store.get('goals').filter(notDemo),
      budgets: { monthly: budgets.monthly === DEMO_BUDGET.monthly ? 0 : budgets.monthly, byCategory },
      settings: { ...Store.get('settings'), demoLoaded: false },
    });
  }

  function hasDemoData() {
    return ['transactions', 'recurring', 'goals'].some((key) => Store.get(key).some((item) => item.demo));
  }

  return { load, clear, hasDemoData };
})();
