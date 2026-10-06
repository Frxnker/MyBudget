/**
 * tests.js
 * Tests de las funciones de cálculo: dinero, fechas de los recurrentes y estadísticas.
 */
const { describe, it, equal, close, ok } = Test;
const EUR = ' €'; // formatMoney separa el símbolo con un espacio no separable

/* =================================================================
 * Utils.toCents
 * ================================================================= */
describe('Utils.toCents', () => {
  it('formato español con coma decimal', () => {
    equal(Utils.toCents('12,50'), 1250);
    equal(Utils.toCents('12,5'), 1250);
    equal(Utils.toCents('0,99'), 99);
    equal(Utils.toCents(',5'), 50);
  });

  it('formato inglés con punto decimal', () => {
    equal(Utils.toCents('12.50'), 1250);
    equal(Utils.toCents('12.5'), 1250);
    equal(Utils.toCents('0.01'), 1);
  });

  it('enteros sin separadores', () => {
    equal(Utils.toCents('1250'), 125000);
    equal(Utils.toCents('0'), 0);
  });

  it('separador de miles español', () => {
    equal(Utils.toCents('1.250,50'), 125050);
    equal(Utils.toCents('1.250.000'), 125000000);
    equal(Utils.toCents('1.250.000,99'), 125000099);
    equal(Utils.toCents('2.000'), 200000, 'punto + 3 cifras = miles');
  });

  it('separador de miles inglés', () => {
    equal(Utils.toCents('1,250.50'), 125050);
    equal(Utils.toCents('1,250,000.75'), 125000075);
  });

  it('ignora espacios y el símbolo €', () => {
    equal(Utils.toCents(' 12,50 € '), 1250);
    equal(Utils.toCents('1.250,50 €'), 125050);
  });

  it('redondea al céntimo (mitad hacia arriba)', () => {
    equal(Utils.toCents('0,005'), 1);
    equal(Utils.toCents('0,004'), 0);
    equal(Utils.toCents('12,345'), 1235);
    equal(Utils.toCents('12,999'), 1300);
    equal(Utils.toCents('99,995'), 10000);
  });

  it('acepta números de JavaScript', () => {
    equal(Utils.toCents(19.99), 1999);
    equal(Utils.toCents(0.1 + 0.2), 30);
    equal(Utils.toCents(1250), 125000);
  });

  it('cantidades negativas', () => {
    equal(Utils.toCents('-5,25'), -525);
    equal(Utils.toCents('-1.250,50'), -125050);
  });

  it('devuelve NaN con entradas inválidas', () => {
    ['', '   ', 'abc', '12a', '€', ',', '.', '--5', '1,2,3', '12,5,0'].forEach((input) => {
      equal(Utils.toCents(input), NaN, `"${input}"`);
    });
    equal(Utils.toCents(null), NaN, 'null');
    equal(Utils.toCents(undefined), NaN, 'undefined');
    equal(Utils.toCents(NaN), NaN, 'NaN');
    equal(Utils.toCents(Infinity), NaN, 'Infinity');
  });

  it('devuelve NaN si los miles no van en grupos de 3 cifras', () => {
    ['1.2.3', '12.50,30', '1,50.3', '1.2345,6', '12,5.0'].forEach((input) => {
      equal(Utils.toCents(input), NaN, `"${input}"`);
    });
  });

  it('centsToInput y toCents son inversas', () => {
    [1, 99, 1250, 125050, 100000000].forEach((cents) => {
      equal(Utils.toCents(Utils.centsToInput(cents)), cents, String(cents));
    });
    equal(Utils.centsToInput(125050), '1250,50');
  });
});

/* =================================================================
 * Utils.formatMoney
 * ================================================================= */
describe('Utils.formatMoney', () => {
  it('formato español con miles y dos decimales', () => {
    equal(Utils.formatMoney(125050), `1.250,50${EUR}`);
    equal(Utils.formatMoney(123456789), `1.234.567,89${EUR}`);
    equal(Utils.formatMoney(1000000), `10.000,00${EUR}`);
  });

  it('cantidades pequeñas y cero', () => {
    equal(Utils.formatMoney(0), `0,00${EUR}`);
    equal(Utils.formatMoney(5), `0,05${EUR}`);
    equal(Utils.formatMoney(99), `0,99${EUR}`);
    equal(Utils.formatMoney(100000), `1.000,00${EUR}`, 'agrupa también los números de 4 cifras');
  });

  it('negativos', () => {
    equal(Utils.formatMoney(-5), `-0,05${EUR}`);
    equal(Utils.formatMoney(-125050), `-1.250,50${EUR}`);
  });

  it('opción sign añade "+" a los positivos', () => {
    equal(Utils.formatMoney(100, { sign: true }), `+1,00${EUR}`);
    equal(Utils.formatMoney(-100, { sign: true }), `-1,00${EUR}`);
    equal(Utils.formatMoney(0, { sign: true }), `0,00${EUR}`);
  });

  it('opción decimals: false redondea a euros', () => {
    equal(Utils.formatMoney(125049, { decimals: false }), `1.250${EUR}`);
    equal(Utils.formatMoney(125050, { decimals: false }), `1.251${EUR}`);
  });

  it('valores no numéricos se muestran como 0', () => {
    equal(Utils.formatMoney('abc'), `0,00${EUR}`);
    equal(Utils.formatMoney(undefined), `0,00${EUR}`);
  });

  it('formatPercent usa coma decimal', () => {
    equal(Utils.formatPercent(42.5), '42,5 %');
    equal(Utils.formatPercent(NaN), '—');
  });
});

/* =================================================================
 * Recurring.occurrences
 * ================================================================= */
describe('Recurring.occurrences', () => {
  const rec = (day, frequency, startMonth) => ({ id: 'r', name: 'r', amount: 100, day, frequency, startMonth, active: true });

  it('mensual: una fecha por mes dentro del rango', () => {
    equal(Recurring.occurrences(rec(15, 'monthly', '2025-01'), '2025-01-01', '2025-03-31'),
      ['2025-01-15', '2025-02-15', '2025-03-15']);
  });

  it('los límites del rango están incluidos', () => {
    equal(Recurring.occurrences(rec(15, 'monthly', '2025-01'), '2025-02-15', '2025-02-15'), ['2025-02-15']);
    equal(Recurring.occurrences(rec(15, 'monthly', '2025-01'), '2025-02-16', '2025-03-14'), []);
  });

  it('empieza a contar desde la fecha "from" aunque el inicio sea anterior', () => {
    equal(Recurring.occurrences(rec(5, 'monthly', '2024-01'), '2025-03-10', '2025-05-31'),
      ['2025-04-05', '2025-05-05']);
  });

  it('no hay cobros antes del mes de inicio', () => {
    equal(Recurring.occurrences(rec(1, 'monthly', '2025-06'), '2025-01-01', '2025-07-31'),
      ['2025-06-01', '2025-07-01']);
  });

  it('día 31 en meses cortos usa el último día del mes', () => {
    equal(Recurring.occurrences(rec(31, 'monthly', '2025-01'), '2025-01-01', '2025-06-30'),
      ['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30', '2025-05-31', '2025-06-30']);
  });

  it('años bisiestos: febrero tiene 29 días', () => {
    equal(Recurring.occurrences(rec(31, 'monthly', '2024-02'), '2024-02-01', '2024-02-29'), ['2024-02-29']);
    equal(Recurring.occurrences(rec(29, 'monthly', '2025-02'), '2025-02-01', '2025-02-28'), ['2025-02-28']);
    equal(Recurring.occurrences(rec(30, 'monthly', '2000-02'), '2000-02-01', '2000-02-29'), ['2000-02-29'], '2000 es bisiesto');
    equal(Recurring.occurrences(rec(30, 'monthly', '2100-02'), '2100-02-01', '2100-02-28'), ['2100-02-28'], '2100 no es bisiesto');
  });

  it('anual el 29 de febrero', () => {
    equal(Recurring.occurrences(rec(29, 'yearly', '2024-02'), '2024-01-01', '2028-12-31'),
      ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('bimestral, trimestral y semestral', () => {
    equal(Recurring.occurrences(rec(10, 'bimonthly', '2025-01'), '2025-01-01', '2025-06-30'),
      ['2025-01-10', '2025-03-10', '2025-05-10']);
    equal(Recurring.occurrences(rec(10, 'quarterly', '2025-01'), '2025-02-01', '2025-12-31'),
      ['2025-04-10', '2025-07-10', '2025-10-10']);
    equal(Recurring.occurrences(rec(1, 'semiannual', '2024-03'), '2025-01-01', '2026-12-31'),
      ['2025-03-01', '2025-09-01', '2026-03-01', '2026-09-01']);
  });

  it('anual mantiene el mes de inicio', () => {
    equal(Recurring.occurrences(rec(10, 'yearly', '2023-11'), '2025-01-01', '2026-12-31'),
      ['2025-11-10', '2026-11-10']);
  });

  it('rango vacío si "to" es anterior a "from"', () => {
    equal(Recurring.occurrences(rec(1, 'monthly', '2025-01'), '2025-05-01', '2025-04-01'), []);
  });
});

/* =================================================================
 * Stats
 * Datos de prueba en 2024 (año pasado y bisiesto) para que los
 * resultados no dependan de la fecha en que se ejecuten los tests.
 * ================================================================= */
const tx = (id, type, amount, categoryId, date) => ({
  id, type, concept: id, amount, categoryId, date, method: 'Efectivo', notes: '', createdAt: 1,
});

const FIXTURE = [
  tx('t1', 'income', 200000, 'inc-salario', '2024-01-05'),
  tx('t2', 'expense', 50000, 'exp-alimentacion', '2024-01-10'),
  tx('t3', 'expense', 25050, 'exp-ocio', '2024-01-10'),
  tx('t4', 'expense', 10000, 'exp-transporte', '2024-01-31'),
  tx('t5', 'income', 210000, 'inc-salario', '2024-02-01'),
  tx('t6', 'expense', 80000, 'exp-alimentacion', '2024-02-15'),
  tx('t7', 'expense', 5000, 'exp-ocio', '2024-02-29'),
  tx('t8', 'income', 100000, 'inc-otros', '2099-01-01'), // futuro: no cuenta para el saldo
];

// Store trabaja sobre el LocalStorage simulado en memoria (ver tests/index.html)
Store.init();
Store.set('transactions', FIXTURE);

describe('Stats: funciones puras', () => {
  it('change: variación porcentual', () => {
    equal(Stats.change(150, 100), 50);
    equal(Stats.change(50, 100), -50);
    equal(Stats.change(0, 100), -100);
    equal(Stats.change(-50, -100), 50, 'pasar de -100 a -50 es una mejora del 50 %');
  });

  it('change: null si no hay valor anterior', () => {
    equal(Stats.change(100, 0), null);
  });

  it('summarize: ingresos, gastos, ahorro y tasa', () => {
    const s = Stats.summarize(FIXTURE.slice(0, 4));
    equal([s.income, s.expense, s.savings, s.count], [200000, 85050, 114950, 4]);
    close(s.rate, 57.475);
  });

  it('summarize: lista vacía', () => {
    equal(Stats.summarize([]), { income: 0, expense: 0, savings: 0, rate: 0, count: 0 });
  });

  it('summarize: tasa 0 si no hay ingresos', () => {
    const s = Stats.summarize([FIXTURE[1]]);
    equal(s.savings, -50000);
    equal(s.rate, 0);
  });

  it('byCategory: agrupa, ordena de mayor a menor y calcula porcentajes', () => {
    const result = Stats.byCategory(FIXTURE.filter((t) => t.type === 'expense'));
    equal(result.map((r) => [r.categoryId, r.total]),
      [['exp-alimentacion', 130000], ['exp-ocio', 30050], ['exp-transporte', 10000]]);
    equal(result[0].category.name, 'Alimentación');
    close(result.reduce((sum, r) => sum + r.pct, 0), 100);
  });

  it('byCategory: categoría desconocida', () => {
    const [item] = Stats.byCategory([tx('x', 'expense', 100, 'no-existe', '2024-01-01')]);
    equal(item.category.name, 'Sin categoría');
    equal(item.pct, 100);
  });
});

describe('Stats: cálculos sobre los movimientos', () => {
  it('monthSummary', () => {
    const jan = Stats.monthSummary('2024-01');
    equal([jan.income, jan.expense, jan.savings], [200000, 85050, 114950]);
    const feb = Stats.monthSummary('2024-02');
    equal([feb.income, feb.expense, feb.savings], [210000, 85000, 125000]);
    equal(Stats.monthSummary('2024-03').count, 0);
  });

  it('balance: excluye los movimientos con fecha futura', () => {
    equal(Stats.balance(), 410000 - 170050);
  });

  it('monthTrends respecto al mes anterior', () => {
    const trends = Stats.monthTrends('2024-02');
    close(trends.income, 5);
    close(trends.expense, ((85000 - 85050) / 85050) * 100);
    close(trends.savings, ((125000 - 114950) / 114950) * 100);
    equal(Stats.monthTrends('2024-01').income, null, 'sin datos en diciembre de 2023');
  });

  it('categorySpent', () => {
    equal(Stats.categorySpent('2024-01', 'exp-ocio'), 25050);
    equal(Stats.categorySpent('2024-01', 'exp-salud'), 0);
  });

  it('topCategories compara con el mes anterior', () => {
    const top = Stats.topCategories('2024-02');
    equal(top.map((c) => [c.categoryId, c.total, c.previous]),
      [['exp-alimentacion', 80000, 50000], ['exp-ocio', 5000, 25050]]);
    close(top[0].change, 60);
  });

  it('dailyExpenses: un valor por día del mes', () => {
    const jan = Stats.dailyExpenses('2024-01');
    equal(jan.length, 31);
    equal(jan[9], 75050, 'día 10');
    equal(jan[30], 10000, 'día 31');
    equal(jan.reduce((a, b) => a + b, 0), 85050);
    const feb = Stats.dailyExpenses('2024-02');
    equal(feb.length, 29, 'febrero de 2024 es bisiesto');
    equal(feb[28], 5000);
  });

  it('evolution: últimos N meses en orden', () => {
    const evo = Stats.evolution('2024-02', 3);
    equal(evo.map((m) => [m.key, m.income, m.expense]),
      [['2023-12', 0, 0], ['2024-01', 200000, 85050], ['2024-02', 210000, 85000]]);
  });

  it('monthStats de un mes pasado usa todos sus días', () => {
    const stats = Stats.monthStats('2024-01');
    equal(stats.avgDaily, Math.round(85050 / 31));
    equal(stats.maxDay, { date: '2024-01-10', total: 75050 });
  });

  it('monthStats de un mes futuro no divide entre 0', () => {
    const stats = Stats.monthStats('2099-02');
    equal([stats.avgDaily, stats.maxDay], [0, null]);
  });

  it('yearStats de un año completo (bisiesto)', () => {
    const y = Stats.yearStats(2024);
    equal([y.income, y.expense, y.savings, y.count], [410000, 170050, 239950, 7]);
    equal(y.avgDaily, Math.round(170050 / 366), 'gasto medio diario con 366 días');
    equal(y.avgMonthly, Math.round(170050 / 12));
    equal(y.topCategory.categoryId, 'exp-alimentacion');
    equal(y.biggest.id, 't6');
    equal(y.maxDay, { date: '2024-02-15', total: 80000 });
  });

  it('yearStats de un año sin movimientos', () => {
    const y = Stats.yearStats(2020);
    equal([y.expense, y.avgDaily, y.topCategory, y.biggest, y.maxDay], [0, 0, null, null, null]);
  });

  it('yearSummary: 12 meses', () => {
    const months = Stats.yearSummary(2024);
    equal(months.length, 12);
    equal(months.map((m) => m.key)[11], '2024-12');
    equal([months[0].expense, months[1].expense, months[2].expense], [85050, 85000, 0]);
  });
});
