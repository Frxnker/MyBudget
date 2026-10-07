/**
 * data-tests.js
 * Tests de los datos: migración de versiones anteriores, importación/exportación, búsqueda,
 * duplicado de movimientos, validaciones y almacenamiento de recibos.
 * Usan el LocalStorage simulado en memoria de tests/index.html.
 */
(() => {
  const { describe, it, itAsync, equal, close, ok } = Test;
  const PREFIX = 'gestorGastos.';

  /** Guarda datos "en bruto", como los dejaría una versión anterior de la app */
  function writeRaw(data) {
    localStorage.clear();
    Object.entries(data).forEach(([key, value]) => localStorage.setItem(PREFIX + key, JSON.stringify(value)));
  }
  const readRaw = (key) => JSON.parse(localStorage.getItem(PREFIX + key));

  /** Datos tal y como los guardaba MyBudget 1.0 (formato v1) */
  function v1Data() {
    return {
      transactions: [
        { id: 't1', type: 'expense', concept: 'Café', amount: 150, categoryId: 'exp-ocio', date: '2025-05-02', method: 'Efectivo', notes: '', createdAt: 1 },
        { id: 't2', type: 'income', concept: 'Nómina', amount: 180000, categoryId: 'inc-salario', date: '2025-05-01', method: 'Nómina', notes: '', createdAt: 2, recurringId: 'r1' },
      ],
      categories: [...Categories.defaults(), { id: 'cat_x', name: 'Mascotas', icon: '🐶', type: 'expense', color: '#123456', custom: true }],
      budgets: { monthly: 50000, byCategory: { 'exp-ocio': 10000 } },
      recurring: [{ id: 'r1', name: 'Gimnasio', amount: 3000, categoryId: 'exp-salud', day: 1, frequency: 'monthly', startMonth: '2025-01', method: 'Domiciliación', active: true }],
      goals: [{ id: 'g1', name: 'Viaje', icon: '✈️', target: 100000, saved: 20000, deadline: '2026-12-01', createdAt: 1 }],
      settings: { userName: 'Lucía', demoLoaded: false, demoBannerHidden: true, schemaVersion: 1 },
    };
  }

  /* =================================================================
   * Migración de datos
   * ================================================================= */
  describe('Migración de datos (v1 → v2)', () => {
    it('Migrations.run añade los campos nuevos sin tocar el resto', () => {
      const data = v1Data();
      const migrated = Migrations.run(data, 1, 2);
      equal(migrated.goals[0].startSaved, 0);
      equal([migrated.settings.availableHorizon, migrated.settings.chartRange, migrated.settings.schemaVersion], ['month', '6m', 2]);
      equal(migrated.settings.userName, 'Lucía');
      equal(migrated.transactions, data.transactions);
      equal(data.goals[0].startSaved, undefined, 'no modifica el objeto original');
      equal(Migrations.run(migrated, 2, 2), migrated, 'sin migraciones pendientes no cambia nada');
    });

    it('al abrir la app con datos v1 se migran y se conservan todos', () => {
      const data = v1Data();
      writeRaw(data);
      const result = Store.init();
      equal([result.isFirstRun, result.migratedFrom, result.newerVersion], [false, 1, false]);
      equal(Store.get('transactions').map((t) => t.id), ['t1', 't2']);
      equal(Store.get('transactions')[1].recurringId, 'r1');
      equal(Store.get('categories').find((c) => c.id === 'cat_x').name, 'Mascotas');
      equal(Store.get('budgets'), data.budgets);
      equal(Store.get('recurring')[0].name, 'Gimnasio');
      equal([Store.get('goals')[0].saved, Store.get('goals')[0].startSaved], [20000, 0]);
      equal([Store.get('settings').userName, Store.get('settings').demoBannerHidden], ['Lucía', true]);
      equal(readRaw('settings').schemaVersion, 2, 'se guarda con la versión nueva');
    });

    it('guarda una copia de los datos anteriores a la migración', () => {
      const backup = Store.getMigrationBackup();
      equal([backup.schemaVersion, backup.migratedTo], [1, 2]);
      equal(backup.data.goals, v1Data().goals);
      equal(Store.init().migratedFrom, null, 'la segunda vez ya no se migra');
      Store.clearMigrationBackup();
      equal(Store.getMigrationBackup(), null);
    });

    it('datos sin schemaVersion se tratan como v1', () => {
      const data = v1Data();
      delete data.settings.schemaVersion;
      writeRaw(data);
      equal(Store.init().migratedFrom, 1);
    });

    it('datos de una versión más reciente: no se migran', () => {
      writeRaw({ ...v1Data(), settings: { schemaVersion: 99 } });
      const result = Store.init();
      equal([result.migratedFrom, result.newerVersion], [null, true]);
    });

    it('una clave con JSON dañado no se sobrescribe al migrar', () => {
      writeRaw(v1Data());
      localStorage.setItem(`${PREFIX}transactions`, '{dañado');
      const result = Store.init();
      equal([result.migratedFrom, result.readErrors], [1, 1]);
      equal(localStorage.getItem(`${PREFIX}transactions`), '{dañado', 'se conserva por si se puede recuperar');
      equal(Store.get('transactions'), []);
    });

    it('primera vez: no hay migración ni copia', () => {
      localStorage.clear();
      const result = Store.init();
      equal([result.isFirstRun, result.migratedFrom], [true, null]);
      equal(Store.getMigrationBackup(), null);
      equal(Store.get('settings').schemaVersion, Store.SCHEMA_VERSION);
    });
  });

  /* =================================================================
   * Importación y exportación
   * ================================================================= */
  describe('Importación y exportación', () => {
    const throwsMessage = (fn) => {
      try {
        fn();
      } catch (error) {
        return error.message;
      }
      return null;
    };

    it('rechaza archivos sin el formato de MyBudget', () => {
      ok(throwsMessage(() => Store.inspectBackup(null)), 'null');
      ok(throwsMessage(() => Store.inspectBackup([])), 'array');
      ok(throwsMessage(() => Store.inspectBackup({ hola: 1 })).includes('falta la lista de movimientos'));
      ok(throwsMessage(() => Store.inspectBackup({ data: { transactions: 'x' } })), 'movimientos que no son una lista');
    });

    it('informa de las secciones con un formato incorrecto', () => {
      const message = throwsMessage(() => Store.inspectBackup({ data: { transactions: [], goals: {}, budgets: [] } }));
      ok(message.includes('objetivos') && message.includes('presupuestos'), message);
    });

    it('rechaza copias de una versión más reciente', () => {
      ok(throwsMessage(() => Store.inspectBackup({ schemaVersion: 99, data: { transactions: [] } })).includes('más reciente'));
    });

    it('analiza una copia v1: la migra, la limpia y cuenta lo descartado', () => {
      const data = v1Data();
      data.transactions.push({ id: 'mal', type: 'otro', amount: -5 });
      const inspection = Store.inspectBackup({ app: 'MyBudget', schemaVersion: 1, exportedAt: '2025-05-03T10:00:00Z', data: { ...data, theme: 'dark' } });
      equal([inspection.version, inspection.theme], [1, 'dark']);
      equal(inspection.summary.transactions, { total: 3, valid: 2 });
      equal([inspection.summary.customCategories, inspection.summary.monthlyBudget, inspection.summary.categoryLimits], [1, 50000, 1]);
      equal(inspection.values.goals[0].startSaved, 0);
      equal(inspection.values.settings.schemaVersion, 2);
    });

    it('acepta el formato antiguo sin envoltorio ({ transactions, … })', () => {
      const inspection = Store.inspectBackup({ transactions: v1Data().transactions });
      equal(inspection.summary.transactions.valid, 2);
      equal(inspection.values.categories.length, Categories.defaults().length, 'se completan las categorías predeterminadas');
    });

    it('recibos: solo imágenes válidas y movimientos sin recibos huérfanos', () => {
      const image = 'data:image/png;base64,iVBORw0KGgo=';
      const data = v1Data();
      data.transactions[0].receiptId = 'rcp_ok';
      data.transactions[1].receiptId = 'rcp_mal';
      data.receipts = [
        { id: 'rcp_ok', dataUrl: image },
        { id: 'rcp_mal', dataUrl: 'javascript:alert(1)' },
        { id: '<img>', dataUrl: image },
      ];
      const inspection = Store.inspectBackup({ data });
      equal(inspection.receipts.map((r) => r.id), ['rcp_ok']);
      equal(inspection.summary.receipts, { total: 3, valid: 1 });
      equal(inspection.values.transactions.map((t) => t.receiptId), ['rcp_ok', undefined]);
    });

    it('exportar e importar conserva todos los datos', () => {
      writeRaw(v1Data());
      Store.init();
      const before = ['transactions', 'categories', 'budgets', 'recurring', 'goals'].map((key) => Store.get(key));
      const backup = JSON.parse(JSON.stringify(Store.exportData()));
      equal([backup.app, backup.schemaVersion, backup.appVersion], ['MyBudget', 2, Store.APP_VERSION]);
      localStorage.clear();
      Store.init();
      const result = Store.importData(backup);
      equal(result, { transactions: 2, discarded: 0 });
      equal(['transactions', 'categories', 'budgets', 'recurring', 'goals'].map((key) => Store.get(key)), before);
    });

    it('la importación es atómica: si no cabe, no se modifica nada', () => {
      writeRaw(v1Data());
      Store.init();
      const storedBefore = localStorage.getItem(`${PREFIX}transactions`);
      const cacheBefore = Store.get('transactions');
      const other = { data: { transactions: [{ id: 'nuevo', type: 'expense', concept: 'X', amount: 100, categoryId: 'exp-otros', date: '2025-01-01' }] } };
      const inspection = Store.inspectBackup(other);
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === `${PREFIX}goals`) throw new DOMException('Lleno', 'QuotaExceededError');
        return original.call(this, key, value);
      };
      let message = null;
      try {
        Store.applyImport(inspection);
      } catch (error) {
        message = error.message;
      } finally {
        Storage.prototype.setItem = original;
      }
      ok(message && message.includes('No se ha modificado ningún dato'), `debe lanzar un error (${message})`);
      equal(localStorage.getItem(`${PREFIX}transactions`), storedBefore, 'LocalStorage intacto');
      equal(Store.get('transactions'), cacheBefore, 'memoria intacta');
    });

    it('un .json manipulado no puede inyectar HTML en los ids', () => {
      const inspection = Store.inspectBackup({ data: { transactions: [{ id: '"><script>', type: 'expense', amount: 100, date: '2025-01-01' }] } });
      equal(inspection.values.transactions, []);
    });
  });

  /* =================================================================
   * Búsqueda de movimientos
   * ================================================================= */
  describe('Búsqueda de movimientos', () => {
    const mk = (id, type, amount, categoryId, concept, notes = '') => ({
      id, type, amount, categoryId, concept, notes, date: '2025-03-01', method: 'Tarjeta', createdAt: 1,
    });
    const list = [
      mk('s1', 'expense', 5000, 'exp-transporte', 'Gasolina Repsol'),
      mk('s2', 'expense', 5099, 'exp-compras', 'Amazon pedido'),
      mk('s3', 'expense', 15000, 'exp-compras', 'Amazon televisor'),
      mk('s4', 'expense', 1250, 'exp-alimentacion', 'Mercadona'),
      mk('s5', 'income', 3000, 'inc-otros', 'Venta Wallapop'),
      mk('s6', 'expense', 3000, 'exp-compras', 'Amazon libro', 'Para un amigo'),
    ];
    const search = (text, extra = {}) => Transactions.applyFilters(list, {
      text, type: 'all', categoryId: '', from: '', to: '', method: '', ...extra,
    }).map((t) => t.id);

    it('por descripción, sin importar mayúsculas ni tildes', () => {
      equal(search('amazon'), ['s2', 's3', 's6']);
      equal(search('AMAZÓN'), ['s2', 's3', 's6']);
      equal(search('gasolina'), ['s1']);
      equal(search('amigo'), ['s6'], 'también en las notas');
    });

    it('por categoría', () => {
      equal(search('alimentación'), ['s4']);
      equal(search('alimentacion'), ['s4']);
    });

    it('por importe: "50" encuentra 50,00 y 50,99 € (no 150 €); "12,50" solo 12,50 €', () => {
      equal(search('50'), ['s1', 's2']);
      equal(search('12,50'), ['s4']);
      equal(search('12.50'), ['s4']);
      equal(search('30'), ['s5', 's6']);
    });

    it('por tipo de movimiento', () => {
      equal(search('ingreso'), ['s5']);
      equal(search('gastos'), ['s1', 's2', 's3', 's4', 's6']);
    });

    it('varias palabras y junto con los filtros', () => {
      equal(search('amazon 30'), ['s6']);
      equal(search('30', { type: 'income' }), ['s5']);
      equal(search('amazon', { categoryId: 'exp-compras', from: '2025-01-01', to: '2025-12-31' }), ['s2', 's3', 's6']);
      equal(search(''), ['s1', 's2', 's3', 's4', 's5', 's6']);
      equal(search('   '), ['s1', 's2', 's3', 's4', 's5', 's6']);
      equal(search('zzz'), []);
    });

    it('parseQuery reconoce las cantidades', () => {
      equal(Transactions.parseQuery('Amazon 12,50 1.250'), [
        { word: 'amazon' },
        { word: '12,50', cents: 1250, wholeEuros: false },
        { word: '1.250', cents: 125000, wholeEuros: true },
      ]);
    });
  });

  /* =================================================================
   * Duplicar movimientos
   * ================================================================= */
  describe('Duplicar movimientos', () => {
    const source = {
      id: 'tx_1', type: 'expense', concept: 'Supermercado', amount: 4520, categoryId: 'exp-alimentacion',
      date: '2025-01-10', method: 'Tarjeta de débito', notes: 'Compra semanal', createdAt: 1,
      receiptId: 'rcp_1', recurringId: 'rec_1', demo: true,
    };

    it('mantiene importe, categoría, descripción, tipo, método y notas con la fecha de hoy', () => {
      equal(Transactions.duplicateData(source, '2025-03-05'), {
        type: 'expense', concept: 'Supermercado', amount: 4520, categoryId: 'exp-alimentacion',
        method: 'Tarjeta de débito', notes: 'Compra semanal', date: '2025-03-05',
      });
    });

    it('no copia id, recibo, enlace al recurrente ni la marca de ejemplo', () => {
      const copy = Transactions.duplicateData(source);
      ['id', 'receiptId', 'recurringId', 'demo', 'createdAt'].forEach((key) => equal(copy[key], undefined, key));
      equal(copy.date, Utils.todayISO(), 'por defecto, hoy');
    });

    it('duplicate() crea un movimiento nuevo con fecha de hoy', () => {
      localStorage.clear();
      Store.init();
      Store.set('transactions', [source]);
      const toast = UI.toast;
      UI.toast = () => {}; // la página de tests no tiene contenedor de avisos
      try {
        Transactions.duplicate('tx_1');
      } finally {
        UI.toast = toast;
      }
      const all = Store.get('transactions');
      equal(all.length, 2);
      ok(all[1].id !== 'tx_1', 'id nuevo');
      equal([all[1].date, all[1].amount, all[1].receiptId], [Utils.todayISO(), 4520, undefined]);
      equal(all[0], source, 'el original no cambia');
    });
  });

  /* =================================================================
   * Validaciones
   * ================================================================= */
  describe('Validaciones', () => {
    it('importes', () => {
      equal(Validate.amount('12,50'), { cents: 1250 });
      equal(Validate.amount(''), { error: 'La cantidad es obligatoria.' });
      equal(Validate.amount('   '), { error: 'La cantidad es obligatoria.' });
      ok(Validate.amount('-5').error.includes('mayor que 0'));
      ok(Validate.amount('0').error.includes('mayor que 0'));
      equal(Validate.amount('0', { allowZero: true }), { cents: 0 });
      ok(Validate.amount('abc').error.includes('no es un número válido'));
      ok(Validate.amount('1e5').error, 'notación científica');
      ok(Validate.amount('9999999999999').error.includes('demasiado grande'));
      equal(Validate.amount('', { required: false }), { cents: 0 });
      equal(UI.validateAmount('5'), { cents: 500 }, 'UI.validateAmount sigue funcionando');
    });

    it('fechas', () => {
      equal(Validate.date('2024-02-29'), { value: '2024-02-29' });
      ok(Validate.date('2025-02-29').error, '2025 no es bisiesto');
      ok(Validate.date('2026-13-01').error);
      equal(Validate.date(''), { error: 'La fecha es obligatoria.' });
      equal(Validate.date('', { required: false }), { value: '' });
    });

    it('imágenes de recibos: formato y tamaño', () => {
      equal(Validate.imageFile({ name: 'r.jpg', type: 'image/jpeg', size: 1000 }), null);
      equal(Validate.imageFile({ name: 'r.webp', type: 'image/webp', size: 1000 }), null);
      equal(Validate.imageFile({ name: 'foto.PNG', type: '', size: 10 }), null, 'sin tipo: se mira la extensión');
      ok(Validate.imageFile({ name: 'r.gif', type: 'image/gif', size: 10 }).includes('Formato no admitido'));
      ok(Validate.imageFile({ name: 'r.pdf', type: 'application/pdf', size: 10 }).includes('Formato no admitido'));
      ok(Validate.imageFile({ name: 'r.jpg', type: 'image/jpeg', size: 11 * 1024 * 1024 }).includes('tamaño máximo'));
      ok(Validate.imageFile({ name: 'r.jpg', type: 'image/jpeg', size: 0 }).includes('vacía'));
      ok(Validate.imageFile(null));
    });

    it('data URL de imágenes', () => {
      ok(Validate.isImageDataUrl('data:image/jpeg;base64,/9j/4AAQ'));
      ok(!Validate.isImageDataUrl('data:image/svg+xml;base64,PHN2Zz4='), 'SVG no (puede llevar scripts)');
      ok(!Validate.isImageDataUrl('data:text/html;base64,PGI+'));
      ok(!Validate.isImageDataUrl(42));
    });
  });

  /* =================================================================
   * Recibos (asíncronos: se ejecutan al final)
   * ================================================================= */
  describe('Recibos', () => {
    const image = (n) => ({ id: `rcp_${n}`, dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1, createdAt: n });

    /** Crea un archivo PNG de prueba dibujado en un canvas */
    function pngFile(width, height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#5b5bd6');
      gradient.addColorStop(1, '#c4f2a1');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      return new Promise((resolve) => canvas.toBlob((blob) => resolve(new File([blob], 'recibo.png', { type: 'image/png' })), 'image/png'));
    }

    const rejects = async (promise) => {
      try {
        await promise;
      } catch (error) {
        return error.message;
      }
      return null;
    };

    itAsync('guardar, leer y borrar', async () => {
      Receipts.useStore('local');
      await Receipts.clear();
      await Receipts.save(image(1));
      equal((await Receipts.get('rcp_1')).dataUrl, 'data:image/png;base64,AAAA');
      equal(await Receipts.get('no-existe'), null);
      await Receipts.remove('rcp_1');
      equal(await Receipts.get('rcp_1'), null);
    });

    itAsync('limpia los recibos que ya no usa ningún movimiento', async () => {
      Receipts.useStore('local');
      await Receipts.clear();
      await Promise.all([1, 2, 3].map((n) => Receipts.save(image(n))));
      equal(await Receipts.prune(new Set(['rcp_2'])), 2);
      equal((await Receipts.exportAll()).map((r) => r.id), ['rcp_2']);
    });

    itAsync('sustituir todos (importación), exportar y medir el espacio', async () => {
      Receipts.useStore('local');
      await Receipts.replaceAll([image(7), image(8)]);
      equal((await Receipts.exportAll()).map((r) => r.id).sort(), ['rcp_7', 'rcp_8']);
      equal(await Receipts.stats(), { count: 2, bytes: 6, store: 'local' });
      equal(Receipts.byteSize('data:image/png;base64,AAAA'), 3);
      await Receipts.clear();
      equal((await Receipts.stats()).count, 0);
    });

    itAsync('reduce y comprime las imágenes grandes', async () => {
      const result = await Receipts.compress(await pngFile(3000, 2000));
      equal([result.width, result.height], [1600, 1067]);
      ok(Validate.isImageDataUrl(result.dataUrl), 'data URL de imagen válida');
      ok(/^data:image\/(webp|jpeg)/.test(result.dataUrl), 'se guarda en WEBP o JPEG');
      ok(result.dataUrl.length <= 700 * 1024, `ocupa ${result.dataUrl.length} caracteres`);
    });

    itAsync('rechaza formatos no admitidos e imágenes dañadas', async () => {
      ok((await rejects(Receipts.compress(new File(['hola'], 'nota.txt', { type: 'text/plain' })))).includes('Formato no admitido'));
      ok((await rejects(Receipts.compress(new File([new Uint8Array([1, 2, 3, 4])], 'x.png', { type: 'image/png' })))).includes('no es una imagen válida'));
    });
  });
})();
