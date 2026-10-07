/**
 * finance-tests.js
 * Tests de los cálculos financieros (finance.js), los avisos y consejos (con contextos fijos)
 * y las estadísticas nuevas de la v1.1. Las fechas son fijas para que los resultados no dependan
 * del día en que se ejecutan.
 */
(() => {
  const { describe, it, equal, close, ok } = Test;
  const money = (cents) => Utils.formatMoney(cents);
  const pct = (value, digits = 0) => Utils.formatPercent(value, digits);

  /* =================================================================
   * Comparaciones y tasa de ahorro
   * ================================================================= */
  describe('Finance.compare y tasa de ahorro', () => {
    it('variación entre dos meses (742 € → 681 € = ↓ 8,2 %)', () => {
      const c = Finance.compare(68100, 74200);
      equal([c.current, c.previous, c.diff, c.direction], [68100, 74200, -6100, 'down']);
      close(c.pct, -8.221, 0.001);
      close(Finance.compare(145000, 140000).pct, 3.571, 0.001, '1.400 € → 1.450 € = ↑ 3,6 %');
    });

    it('sin valor anterior no hay porcentaje', () => {
      equal(Finance.compare(5000, 0).pct, null);
      equal(Finance.compare(5000, 0).direction, 'up');
      equal(Finance.compare(100, 100).direction, 'same');
    });

    it('variación de valores negativos usa el valor absoluto', () => {
      close(Finance.compare(-5000, -10000).pct, 50);
    });

    it('tasa de ahorro (1.650 € de ingresos y 402,68 € de gastos = 75,6 %)', () => {
      close(Finance.savingsRate(165000, 40268), 75.6, 0.01);
      equal(Finance.savingsRate(0, 1000), 0, 'sin ingresos la tasa es 0 (no NaN)');
      equal(Finance.savingsRate(100000, 150000), -50);
    });

    it('compareCategories: une las categorías de los dos meses y las ordena', () => {
      const cat = (id) => ({ name: id });
      const rows = Finance.compareCategories(
        [{ categoryId: 'a', category: cat('a'), total: 10000 }, { categoryId: 'b', category: cat('b'), total: 5000 }],
        [{ categoryId: 'a', category: cat('a'), total: 8000 }, { categoryId: 'c', category: cat('c'), total: 20000 }],
      );
      equal(rows.map((r) => [r.categoryId, r.a, r.b, r.diff]), [['c', 0, 20000, 20000], ['a', 10000, 8000, -2000], ['b', 5000, 0, -5000]]);
      equal(rows[0].pct, null, 'categoría nueva: sin porcentaje');
      close(rows[1].pct, -20);
      close(rows[2].pct, -100);
    });
  });

  /* =================================================================
   * Presupuesto inteligente
   * ================================================================= */
  describe('Finance.budgetPlan (presupuesto inteligente)', () => {
    it('ejemplo: 1.000 € de presupuesto, 623 € gastados y 12 días restantes', () => {
      const p = Finance.budgetPlan({ limit: 100000, spent: 62300, daysInMonth: 30, day: 19 });
      equal([p.remaining, p.daysLeft, p.recommendedDaily], [37700, 12, 3142], 'restante, días y 31,42 €/día');
      close(p.pct, 62.3);
      equal(p.projected, 98368, 'previsión: 623 + 623 / 19 × 11');
      equal(p.status, 'ok');
    });

    it('detecta que se gasta más rápido de lo recomendado', () => {
      const p = Finance.budgetPlan({ limit: 100000, spent: 60000, daysInMonth: 30, day: 10 });
      equal(p.projected, 180000);
      equal(p.status, 'fast');
      equal(p.recommendedDaily, Math.round(40000 / 21));
    });

    it('presupuesto superado: recomendado 0 y estado "over"', () => {
      const p = Finance.budgetPlan({ limit: 100000, spent: 110000, daysInMonth: 30, day: 20 });
      equal([p.status, p.remaining, p.recommendedDaily], ['over', -10000, 0]);
    });

    it('los pagos recurrentes no se extrapolan y los pendientes se reservan', () => {
      const p = Finance.budgetPlan({ limit: 130000, spent: 96369, daysInMonth: 31, day: 7, fixedSpent: 69599, pendingFixed: 5289 });
      equal(p.recommendedDaily, 1134, '(336,31 − 52,89) / 25 días');
      equal(p.avgDaily, 3824, 'media de los gastos variables');
      equal(p.projected, 193441, '963,69 + 52,89 + 38,24 × 24');
      ok(p.projected < Math.round((96369 / 7) * 31), 'mucho menor que extrapolar también el alquiler');
    });

    it('mes que aún no ha empezado (día 0) y último día del mes', () => {
      const future = Finance.budgetPlan({ limit: 90000, spent: 0, daysInMonth: 30, day: 0 });
      equal([future.daysLeft, future.recommendedDaily, future.projected, future.status], [30, 3000, 0, 'ok']);
      const last = Finance.budgetPlan({ limit: 90000, spent: 80000, daysInMonth: 30, day: 30 });
      equal([last.daysLeft, last.recommendedDaily, last.projected], [1, 10000, 80000]);
    });
  });

  /* =================================================================
   * Dinero disponible
   * ================================================================= */
  describe('Finance.availableMoney (dinero disponible)', () => {
    it('saldo 1.200 € menos 85 € de pagos próximos = 1.115 €', () => {
      equal(Finance.availableMoney(120000, [8500]), { balance: 120000, pending: 8500, available: 111500, count: 1 });
    });

    it('sin pagos pendientes el disponible es el saldo', () => {
      equal(Finance.availableMoney(5000, []).available, 5000);
      equal(Finance.availableMoney(1000, [999, 2000]).available, -1999, 'puede quedar en negativo');
    });
  });

  /* =================================================================
   * Objetivos de ahorro
   * ================================================================= */
  describe('Finance.goalPlan (objetivos de ahorro)', () => {
    const jan1 = new Date(2026, 0, 1).getTime();
    const goal = (extra) => ({ target: 800000, saved: 420000, startSaved: 0, deadline: '2027-12-31', createdAt: jan1, ...extra });

    it('ejemplo: coche 4.200 € / 8.000 € para diciembre de 2027', () => {
      const p = Finance.goalPlan(goal(), '2026-06-15');
      close(p.pct, 52.5);
      equal([p.remaining, p.monthsLeft, p.monthlyNeeded], [380000, 18, 21112], '211,12 €/mes');
      equal([p.daysLeft, p.weeksLeft, p.weeklyNeeded], [564, 81, 4692], 'por semana');
      equal(p.status, 'on-track');
    });

    it('ritmo necesario: al día o por detrás (ritmo lineal desde la creación)', () => {
      const behind = Finance.goalPlan(goal({ deadline: '2026-12-31', saved: 300000 }), '2026-07-01');
      equal([behind.expected, behind.shortfall, behind.status], [397802, 97802, 'behind']);
      const close1pct = Finance.goalPlan(goal({ deadline: '2026-12-31', saved: 392000 }), '2026-07-01');
      equal(close1pct.status, 'on-track', 'con un margen del 1 %');
    });

    it('el ritmo parte de lo ahorrado al crear el objetivo (startSaved)', () => {
      const g = { target: 100000, saved: 50000, startSaved: 50000, deadline: '2026-12-31', createdAt: jan1 };
      equal(Finance.goalPlan(g, '2026-01-01').status, 'on-track');
      const later = Finance.goalPlan(g, '2026-07-01');
      equal([later.expected, later.status], [74863, 'behind']);
    });

    it('completado, sin fecha, vencido y con fecha este mes', () => {
      const done = Finance.goalPlan(goal({ saved: 800000 }), '2026-06-15');
      equal([done.status, done.monthlyNeeded, done.pct], ['completed', null, 100]);
      equal(Finance.goalPlan(goal({ deadline: '' }), '2026-06-15').status, 'no-deadline');
      const overdue = Finance.goalPlan(goal({ deadline: '2026-01-31' }), '2026-03-01');
      equal([overdue.status, overdue.daysLeft < 0], ['overdue', true]);
      const thisMonth = Finance.goalPlan(goal({ deadline: '2026-06-30' }), '2026-06-15');
      equal([thisMonth.monthsLeft, thisMonth.monthlyNeeded], [0, 380000], 'hay que ahorrarlo todo este mes');
    });

    it('Goals.progress mantiene los campos de la v1.0', () => {
      const p = Goals.progress({ target: 1000, saved: 250, deadline: '', createdAt: jan1 });
      equal([p.pct, p.remaining, p.completed, p.monthsLeft, p.monthlyNeeded], [25, 750, false, null, null]);
    });
  });

  /* =================================================================
   * Gráfica de evolución
   * ================================================================= */
  describe('Finance.timeline (evolución por periodos)', () => {
    it('tramos de 7 días, 30 días, 3 meses, 6 meses y 1 año', () => {
      const days7 = Finance.timelineBuckets('7d', '2026-10-07');
      equal([days7.length, days7[0].start, days7[6].end], [7, '2026-10-01', '2026-10-07']);
      const days30 = Finance.timelineBuckets('30d', '2026-10-07');
      equal([days30.length, days30[0].start], [30, '2026-09-08']);
      const weeks = Finance.timelineBuckets('3m', '2026-10-07');
      equal([weeks.length, weeks[0].start, weeks[0].end, weeks[12].start, weeks[12].end],
        [13, '2026-07-09', '2026-07-15', '2026-10-01', '2026-10-07']);
      const months = Finance.timelineBuckets('6m', '2026-10-07');
      equal(months.map((m) => [m.start, m.end])[0], ['2026-05-01', '2026-05-31']);
      equal([months[5].start, months[5].end], ['2026-10-01', '2026-10-07'], 'el mes actual termina hoy');
      equal(Finance.timelineBuckets('1y', '2026-10-07')[0].start, '2025-11-01');
      equal(Finance.timelineBuckets('desconocido', '2026-10-07').length, 6, 'por defecto 6 meses');
    });

    it('ingresos, gastos y saldo acumulado (incluye lo anterior y no lo posterior)', () => {
      const t = (type, amount, date) => ({ type, amount, date });
      const list = [
        t('income', 100000, '2023-08-01'), // antes del periodo: saldo inicial
        t('expense', 20000, '2023-09-10'),
        t('income', 50000, '2024-01-05'),
        t('expense', 10000, '2024-01-20'),
        t('expense', 5000, '2024-02-10'),
        t('expense', 7000, '2024-02-20'), // después del final: no cuenta
      ];
      const buckets = Finance.timeline(list, '6m', '2024-02-15');
      equal(buckets.map((b) => b.balance), [80000, 80000, 80000, 80000, 120000, 115000]);
      equal([buckets[4].income, buckets[4].expense, buckets[4].count], [50000, 10000, 2]);
      equal(buckets[5].expense, 5000);
      const days = Finance.timeline(list, '7d', '2024-01-20');
      equal([days[6].expense, days[6].balance], [10000, 120000]);
    });
  });

  /* =================================================================
   * Gastos recurrentes
   * ================================================================= */
  describe('Gastos recurrentes: pagos registrados y pendientes', () => {
    const netflix = { id: 'r1', categoryId: 'exp-suscripciones', amount: 1299 };
    const gym = { id: 'r2', categoryId: 'exp-salud', amount: 3500 };
    const exp = (id, date, amount, categoryId, recurringId) => ({ id, type: 'expense', date, amount, categoryId, ...(recurringId ? { recurringId } : {}) });

    it('matchRecurring: enlace por recurringId y por categoría + importe', () => {
      const { paid, matched } = Finance.matchRecurring(
        [{ item: netflix, date: '2024-01-15' }, { item: netflix, date: '2024-02-15' }, { item: gym, date: '2024-01-01' }],
        [
          exp('a', '2024-01-14', 1299, 'exp-suscripciones', 'r1'), // registrado con "Registrar pago"
          exp('b', '2024-02-03', 1299, 'exp-suscripciones'),       // misma categoría e importe
          exp('c', '2024-01-20', 3400, 'exp-salud'),               // otro importe: no cuenta
        ],
      );
      equal([...paid].sort(), ['r1|2024-01-15', 'r1|2024-02-15']);
      equal([...matched].sort(), ['a', 'b']);
    });

    it('cada gasto solo paga un cobro y no se usan gastos de otro mes ni de otro recurrente', () => {
      const other = { id: 'r3', categoryId: 'exp-suscripciones', amount: 1299 };
      const { paid } = Finance.matchRecurring(
        [{ item: netflix, date: '2024-03-15' }, { item: other, date: '2024-03-20' }],
        [exp('x', '2024-03-02', 1299, 'exp-suscripciones')],
      );
      equal(paid.size, 1, 'un gasto, un cobro');
      equal(Finance.matchRecurring([{ item: netflix, date: '2024-04-15' }], [exp('y', '2024-03-30', 1299, 'exp-suscripciones')]).paid.size, 0, 'otro mes');
      equal(Finance.matchRecurring([{ item: netflix, date: '2024-04-15' }], [exp('z', '2024-04-02', 1299, 'exp-suscripciones', 'r9')]).paid.size, 0, 'enlazado con otro recurrente');
    });

    it('Recurring.schedule y monthBreakdown con los datos guardados', () => {
      const previous = { recurring: Store.get('recurring'), transactions: Store.get('transactions') };
      Store.set('recurring', [{ id: 'rec1', name: 'Netflix', amount: 1299, categoryId: 'exp-suscripciones', day: 15, frequency: 'monthly', startMonth: '2024-01', method: '', active: true }]);
      Store.set('transactions', [...FIXTURE, { ...exp('n1', '2024-01-14', 1299, 'exp-suscripciones', 'rec1'), concept: 'Netflix', method: '', notes: '', createdAt: 1 }]);
      try {
        const { list } = Recurring.schedule('2024-01-01', '2024-02-29');
        equal(list.map((o) => [o.date, o.paid]), [['2024-01-15', true], ['2024-02-15', false]]);
        const jan = Recurring.monthBreakdown('2024-01');
        equal([jan.paid.length, jan.fixedSpent, jan.pending.length, jan.overdue.length], [1, 1299, 0, 0]);
        equal(Recurring.monthBreakdown('2024-02').overdue.length, 1, 'cobro pasado sin registrar');
      } finally {
        Store.set('recurring', previous.recurring);
        Store.set('transactions', previous.transactions);
      }
    });
  });

  /* =================================================================
   * Avisos
   * ================================================================= */
  describe('Alerts.build (sistema de avisos)', () => {
    const base = {
      monthName: 'octubre', prevName: 'septiembre', partial: false, future: false, monthly: null,
      categories: [], plan: null, categoryChanges: [], expense: null, rate: null, upcoming: [],
    };
    const build = (extra) => Alerts.build({ ...base, ...extra });

    it('sin datos no hay avisos', () => {
      equal(build({}), []);
    });

    it('más del 80 % de un presupuesto y presupuesto superado', () => {
      const [warn] = build({ categories: [{ id: 'exp-ocio', name: 'Ocio', limit: 10000, spent: 8600, pct: 86 }] });
      equal([warn.level, warn.message], ['warn', `Has utilizado el ${pct(86)} de tu presupuesto de ocio.`]);
      const [over] = build({ categories: [{ id: 'exp-ocio', name: 'Ocio', limit: 10000, spent: 12000, pct: 120 }] });
      equal([over.level, over.message], ['over', `Has superado tu presupuesto de ocio (${money(12000)} de ${money(10000)}).`]);
      const [monthly] = build({ monthly: { limit: 100000, spent: 105000, pct: 105 } });
      equal(monthly.message, `Has superado tu presupuesto mensual en ${money(5000)}.`);
      equal(build({ categories: [{ id: 'x', name: 'X', limit: 10000, spent: 7000, pct: 70 }] }), [], 'por debajo del 80 %: nada');
    });

    it('gasto diario por encima del recomendado', () => {
      const [alert] = build({ plan: { status: 'fast', projected: 193441, recommendedDaily: 1134 } });
      equal([alert.id, alert.level], ['pace', 'warn']);
      ok(alert.message.includes(money(193441)) && alert.message.includes(money(1134)));
      equal(build({ plan: { status: 'ok', projected: 1, recommendedDaily: 1 } }), []);
    });

    it('categoría que aumenta considerablemente (≥ 30 % y ≥ 20 €)', () => {
      const [alert] = build({ categoryChanges: [{ id: 'exp-ocio', name: 'Ocio', current: 17400, previous: 12000 }] });
      equal(alert.message, `Tus gastos en ocio han aumentado un ${pct(45)} respecto a septiembre (${money(12000)} → ${money(17400)}).`);
      equal(build({ categoryChanges: [{ id: 'a', name: 'A', current: 12500, previous: 12000 }] }), [], 'subida pequeña');
      equal(build({ categoryChanges: [{ id: 'a', name: 'A', current: 1500, previous: 1000 }] }), [], '+50 % pero solo 5 €');
    });

    it('gasto total frente al mes anterior (y al mismo periodo en el mes en curso)', () => {
      const [down] = build({ partial: true, expense: { current: 57400, previous: 70000 } });
      equal([down.level, down.message], ['good', `Este mes llevas gastado un ${pct(18)} menos que el mes pasado a estas alturas.`]);
      const [past] = build({ expense: { current: 57400, previous: 70000 } });
      equal(past.message, `En octubre gastaste un ${pct(18)} menos que en septiembre.`);
      equal(build({ expense: { current: 87500, previous: 70000 } })[0].level, 'warn', '+25 %');
      equal(build({ partial: true, expense: { current: 0, previous: 70000 } }), [], 'sin gastos aún no se felicita');
    });

    it('tasa de ahorro que mejora o empeora (≥ 5 puntos)', () => {
      const [better] = build({ rate: { current: 45, previous: 37 } });
      equal([better.level, better.topic], ['good', 'rate']);
      ok(better.message.startsWith('Tu tasa de ahorro ha mejorado 8,0 puntos respecto a septiembre'), better.message);
      equal(build({ rate: { current: 30, previous: 40 } })[0].level, 'warn');
      equal(build({ rate: { current: 41, previous: 40 } }), [], 'cambio pequeño');
    });

    it('pagos recurrentes próximos', () => {
      const [one] = build({ upcoming: [{ name: 'Netflix', amount: 999, days: 3 }] });
      equal([one.level, one.message], ['info', `Tienes un pago recurrente de ${money(999)} (Netflix) en 3 días.`]);
      equal(build({ upcoming: [{ name: 'Luz', amount: 5000, days: 0 }] })[0].message, `Tienes un pago recurrente de ${money(5000)} (Luz) hoy.`);
      const [many] = build({ upcoming: [{ name: 'Netflix', amount: 999, days: 1 }, { name: 'Spotify', amount: 1099, days: 4 }] });
      equal(many.message, `Tienes 2 pagos recurrentes en los próximos 7 días por ${money(2098)} (Netflix, Spotify).`);
    });

    it('meses futuros sin comparaciones y orden por importancia', () => {
      equal(build({ future: true, expense: { current: 0, previous: 70000 }, rate: { current: 0, previous: 40 } }), []);
      const levels = build({
        upcoming: [{ name: 'Netflix', amount: 999, days: 3 }],
        rate: { current: 50, previous: 40 },
        categories: [{ id: 'a', name: 'A', limit: 100, spent: 90, pct: 90 }, { id: 'b', name: 'B', limit: 100, spent: 200, pct: 200 }],
      }).map((a) => a.level);
      equal(levels, ['over', 'warn', 'info', 'good']);
    });
  });

  /* =================================================================
   * Consejos
   * ================================================================= */
  describe('Insights.build (consejos financieros)', () => {
    const base = {
      monthName: 'octubre', prevName: 'septiembre', partial: false, top: null, categoryChanges: [],
      rate: null, recurring: null, trend: [], weekday: null, goal: null,
    };
    const texts = (extra) => Insights.build({ ...base, ...extra }).map((i) => i.text);

    it('sin datos no hay consejos', () => {
      equal(texts({}), []);
    });

    it('variación de una categoría y de la tasa de ahorro', () => {
      equal(texts({ categoryChanges: [{ id: 'exp-ocio', name: 'Ocio', current: 12700, previous: 10000 }] }),
        [`En octubre gastaste un ${pct(27)} más en ocio que en septiembre.`]);
      equal(texts({ partial: true, categoryChanges: [{ id: 'exp-ocio', name: 'Ocio', current: 8000, previous: 10000 }] }),
        [`Este mes llevas gastado un ${pct(20)} menos en ocio que el mes pasado a estas alturas.`]);
      equal(texts({ rate: { current: 30, previous: 22 } }),
        [`Tu tasa de ahorro ha aumentado 8,0 puntos respecto a septiembre (del ${pct(22, 1)} al ${pct(30, 1)}).`]);
    });

    it('peso de los recurrentes y categoría con mayor gasto', () => {
      equal(texts({ recurring: { monthly: 34000, avgExpense: 100000 } }),
        [`Los gastos recurrentes representan el ${pct(34)} de tus gastos mensuales (${money(34000)} al mes).`]);
      equal(texts({ top: { name: 'Alimentación', total: 32000, pct: 34.2 } }),
        [`Tu categoría con mayor gasto en octubre es Alimentación: ${money(32000)}, el ${pct(34)} del total.`]);
    });

    it('tendencia de varios meses seguidos', () => {
      const trend = (...values) => values.map((expense, i) => ({ name: `m${i}`, expense }));
      equal(texts({ trend: trend(90000, 80000, 70000) }),
        [`Has reducido tus gastos 2 meses seguidos: de ${money(90000)} en m0 a ${money(70000)} en m2.`]);
      ok(texts({ trend: trend(100000, 90000, 80000, 70000) })[0].startsWith('Has reducido tus gastos 3 meses seguidos'));
      ok(texts({ trend: trend(50000, 60000, 70000) })[0].startsWith('Tus gastos han aumentado 2 meses seguidos'));
      equal(texts({ trend: trend(70000, 90000, 80000) }), [], 'sin una tendencia clara');
    });

    it('objetivo al ritmo de ahorro actual y día de la semana', () => {
      equal(texts({ goal: { name: 'Coche', remaining: 380000, avgSavings: 100000 } }),
        [`Con tu ahorro medio de los últimos meses (${money(100000)}/mes) podrías completar "Coche" en 4 meses.`]);
      equal(texts({ goal: { name: 'Coche', remaining: 380000, avgSavings: -5000 } }), [], 'sin ahorro no se estima');
      ok(texts({ weekday: { weekday: 5, avg: 8586, overall: 3813 } })[0].startsWith('Los sábados es cuando más gastas'));
      equal(texts({ weekday: { weekday: 5, avg: 4000, overall: 3813 } }), [], 'diferencia pequeña');
    });

    it('no repite temas que ya muestra un aviso', () => {
      const insights = [{ topic: 'rate' }, { topic: 'top' }];
      equal(Insights.withoutAlertTopics(insights, [{ topic: 'rate' }]), [{ topic: 'top' }]);
    });
  });

  /* =================================================================
   * Estadísticas nuevas (sobre FIXTURE de tests.js: enero y febrero de 2024)
   * ================================================================= */
  describe('Stats: comparación mensual, periodos y categorías', () => {
    Store.set('transactions', FIXTURE);

    it('compareMonths: ingresos, gastos, ahorro, tasa, movimientos y gasto medio diario', () => {
      const data = Stats.compareMonths('2024-01', '2024-02');
      const m = Object.fromEntries(data.metrics.map((x) => [x.id, x]));
      equal([m.income.a, m.income.b, m.income.diff], [200000, 210000, 10000]);
      close(m.income.pct, 5);
      equal([m.expense.a, m.expense.b, m.expense.diff], [85050, 85000, -50]);
      equal([m.savings.a, m.savings.b], [114950, 125000]);
      close(m.rate.diff, (125000 / 210000) * 100 - 57.475, 1e-9, 'diferencia en puntos');
      equal(m.rate.pct, null);
      equal([m.count.a, m.count.b], [4, 3]);
      equal([m.avgDaily.a, m.avgDaily.b], [Math.round(85050 / 31), Math.round(85000 / 29)]);
    });

    it('compareMonths: gastos e ingresos por categoría', () => {
      const data = Stats.compareMonths('2024-01', '2024-02');
      equal(data.expenses.map((r) => [r.categoryId, r.a, r.b]),
        [['exp-alimentacion', 50000, 80000], ['exp-ocio', 25050, 5000], ['exp-transporte', 10000, 0]]);
      close(data.expenses[1].pct, ((5000 - 25050) / 25050) * 100);
      equal(data.incomes.map((r) => [r.categoryId, r.a, r.b]), [['inc-salario', 200000, 210000]]);
    });

    it('periodSummary, between y monthKeys', () => {
      const s = Stats.periodSummary('2024-01-10', '2024-02-01');
      equal([s.income, s.expense, s.count], [210000, 85050, 4]);
      equal(Transactions.between('2024-01-31', '2024-02-15').map((t) => t.id), ['t4', 't5', 't6']);
      equal(Transactions.between('2024-02-15', '2024-01-01'), [], 'rango invertido');
      equal(Transactions.monthKeys(), ['2099-01', '2024-02', '2024-01']);
    });

    it('monthComparison de un mes pasado compara meses completos', () => {
      const c = Stats.monthComparison('2024-02');
      equal([c.partial, c.prevKey, c.prevEnd, c.current.income, c.previous.expense], [false, '2024-01', '2024-01-31', 210000, 85050]);
    });

    it('categoryDetail: mes, anterior, media de 6 meses e historial', () => {
      const d = Stats.categoryDetail('exp-ocio', '2024-02');
      equal([d.current, d.previous, d.count, d.total, d.average], [5000, 25050, 2, 30050, Math.round(30050 / 6)]);
      equal(d.history.map((h) => h.key), ['2023-09', '2023-10', '2023-11', '2023-12', '2024-01', '2024-02']);
      equal(d.last.id, 't7');
      close(d.share, (5000 / 85000) * 100);
    });

    it('timeline con los datos guardados (los movimientos futuros no cuentan)', () => {
      const buckets = Stats.timeline('6m', '2024-02-29');
      equal(buckets[5].balance, 410000 - 170050);
      equal(buckets[4].income, 200000);
    });

    it('los resultados en memoria se recalculan al cambiar los datos', () => {
      equal(Stats.monthSummary('2024-03').expense, 0);
      Store.set('transactions', [...FIXTURE, { ...FIXTURE[1], id: 'nuevo', date: '2024-03-03' }]);
      equal(Stats.monthSummary('2024-03').expense, 50000);
      Store.set('transactions', FIXTURE);
      equal(Stats.monthSummary('2024-03').expense, 0);
    });
  });
})();
