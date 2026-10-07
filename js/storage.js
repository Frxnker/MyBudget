/**
 * storage.js
 * Única capa que habla con LocalStorage. El resto de módulos usa Store.get() / Store.set().
 *
 * Estructura en LocalStorage (cada colección en su propia clave):
 *   gestorGastos.transactions → [{ id, type, concept, amount, categoryId, date, method, notes, createdAt, recurringId?, receiptId? }]
 *   gestorGastos.categories   → [{ id, name, icon, type, color, custom }]
 *   gestorGastos.budgets      → { monthly, byCategory: { [categoryId]: cents } }
 *   gestorGastos.recurring    → [{ id, name, amount, categoryId, day, frequency, startMonth, method, active }]
 *   gestorGastos.goals        → [{ id, name, icon, target, saved, startSaved, deadline, createdAt }]
 *   gestorGastos.settings     → { userName, demoLoaded, demoBannerHidden, availableHorizon, chartRange, schemaVersion }
 *   gestorGastos.theme        → "light" | "dark"
 *   gestorGastos.migrationBackup → copia de los datos anteriores a la última migración (si la hubo)
 *
 * Las imágenes de los recibos se guardan aparte (receipts.js).
 * Todas las cantidades se guardan en céntimos (enteros).
 *
 * Versiones del formato: settings.schemaVersion indica con qué versión se guardaron los datos.
 * Al abrir la app con datos antiguos se migran (migrations.js) y antes se guarda una copia.
 */
const Store = (() => {
  const PREFIX = 'gestorGastos.';
  const SCHEMA_VERSION = 2;
  const APP_VERSION = '1.1.0';
  const COLLECTIONS = ['transactions', 'categories', 'budgets', 'recurring', 'goals', 'settings'];
  const BACKUP_KEY = 'migrationBackup';
  const AVAILABLE_HORIZONS = ['month', '30', '7', 'off'];

  const cache = {};       // copia en memoria para no leer LocalStorage constantemente
  const listeners = [];   // funciones a ejecutar cuando cambian los datos
  let listening = false;
  let readErrors = 0;     // claves que no se pudieron leer (JSON dañado o almacenamiento bloqueado)

  function defaults() {
    return {
      transactions: [],
      categories: Categories.defaults(),
      budgets: { monthly: 0, byCategory: {} },
      recurring: [],
      goals: [],
      settings: {
        userName: '',
        demoLoaded: false,
        availableHorizon: 'month',
        chartRange: '6m',
        schemaVersion: SCHEMA_VERSION,
      },
    };
  }

  /* ---------- Lectura / escritura de bajo nivel ---------- */

  function read(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? undefined : JSON.parse(raw);
    } catch (error) {
      console.warn(`No se pudo leer "${key}"`, error);
      readErrors += 1;
      return undefined;
    }
  }

  /** Texto guardado en una clave (null si no existe o no se puede leer) */
  function rawString(key) {
    try {
      return localStorage.getItem(PREFIX + key);
    } catch {
      return null;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(error);
      UI.toast('No se pudieron guardar los datos. El almacenamiento está lleno o bloqueado.', 'error');
      return false;
    }
  }

  /**
   * Escribe varias claves como una sola operación: si alguna falla (p. ej. el almacenamiento está
   * lleno), se restauran las que ya se habían escrito para no dejar los datos a medias.
   */
  function writeMany(values) {
    const previous = {};
    const written = [];
    try {
      Object.entries(values).forEach(([key, value]) => {
        previous[key] = localStorage.getItem(PREFIX + key);
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
        written.push(key);
      });
      return true;
    } catch (error) {
      console.error(error);
      written.reverse().forEach((key) => {
        try {
          if (previous[key] === null) localStorage.removeItem(PREFIX + key);
          else localStorage.setItem(PREFIX + key, previous[key]);
        } catch { /* no se puede hacer nada más */ }
      });
      return false;
    }
  }

  /* ---------- Validación / limpieza de datos ---------- */

  const isText = (v) => typeof v === 'string';
  const isPositiveInt = (v) => Number.isInteger(v) && v > 0;
  const isObject = Validate.isPlainObject;

  // Los ids se insertan en atributos HTML (data-id, value…): solo letras, números, "_" y "-"
  const ID_PATTERN = /^[\w-]{1,64}$/;
  const isValidId = (v) => isText(v) && ID_PATTERN.test(v);
  const optionalId = (v) => (isValidId(v) ? v : '');

  /** Elimina los elementos con un id repetido (se conserva el primero) */
  function uniqueById(list) {
    const seen = new Set();
    return list.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  const sanitizers = {
    transactions: (list) => uniqueById((Array.isArray(list) ? list : [])
      .filter((t) => t && isValidId(t.id) && ['income', 'expense'].includes(t.type)
        && isPositiveInt(t.amount) && Utils.isValidISODate(t.date))
      .map((t) => ({
        id: t.id,
        type: t.type,
        concept: isText(t.concept) ? t.concept.slice(0, 80) : 'Sin concepto',
        amount: t.amount,
        categoryId: optionalId(t.categoryId),
        date: t.date,
        method: isText(t.method) ? t.method : '',
        notes: isText(t.notes) ? t.notes.slice(0, 300) : '',
        createdAt: Number(t.createdAt) || Date.now(),
        // Enlace al gasto recurrente desde el que se registró el pago (opcional)
        ...(isValidId(t.recurringId) ? { recurringId: t.recurringId } : {}),
        // Imagen del recibo, guardada aparte en receipts.js (opcional)
        ...(isValidId(t.receiptId) ? { receiptId: t.receiptId } : {}),
        ...(t.demo ? { demo: true } : {}),
      }))),

    categories: (list) => {
      const valid = uniqueById((Array.isArray(list) ? list : [])
        .filter((c) => c && isValidId(c.id) && isText(c.name) && c.name.trim() && ['income', 'expense'].includes(c.type))
        .map((c) => ({
          id: c.id,
          name: c.name.slice(0, 30),
          icon: isText(c.icon) && c.icon ? c.icon.slice(0, 8) : '🏷️',
          type: c.type,
          color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#8b8d98',
          custom: Boolean(c.custom),
        })));
      // Nos aseguramos de que las categorías predeterminadas siempre existan
      Categories.defaults().forEach((def) => {
        if (!valid.some((c) => c.id === def.id)) valid.push(def);
      });
      return valid;
    },

    budgets: (obj) => {
      const result = { monthly: 0, byCategory: {} };
      if (isObject(obj) && Number.isInteger(obj.monthly) && obj.monthly >= 0) result.monthly = obj.monthly;
      if (isObject(obj) && isObject(obj.byCategory)) {
        Object.entries(obj.byCategory).forEach(([id, value]) => {
          if (isValidId(id) && isPositiveInt(value)) result.byCategory[id] = value;
        });
      }
      return result;
    },

    recurring: (list) => uniqueById((Array.isArray(list) ? list : [])
      .filter((r) => r && isValidId(r.id) && isText(r.name) && isPositiveInt(r.amount)
        && Number.isInteger(r.day) && r.day >= 1 && r.day <= 31)
      .map((r) => ({
        id: r.id,
        name: r.name.slice(0, 60),
        amount: r.amount,
        categoryId: optionalId(r.categoryId),
        day: r.day,
        frequency: Recurring.FREQUENCIES[r.frequency] ? r.frequency : 'monthly',
        startMonth: Utils.isValidMonthKey(r.startMonth) ? r.startMonth : Utils.currentMonthKey(),
        method: isText(r.method) ? r.method : '',
        active: r.active !== false,
        ...(r.demo ? { demo: true } : {}),
      }))),

    goals: (list) => uniqueById((Array.isArray(list) ? list : [])
      .filter((g) => g && isValidId(g.id) && isText(g.name) && isPositiveInt(g.target))
      .map((g) => ({
        id: g.id,
        name: g.name.slice(0, 60),
        icon: isText(g.icon) && g.icon ? g.icon.slice(0, 8) : '🎯',
        target: g.target,
        saved: Number.isInteger(g.saved) && g.saved >= 0 ? g.saved : 0,
        // Ahorro que tenía al crearse: punto de partida para medir si va al ritmo necesario
        startSaved: Number.isInteger(g.startSaved) && g.startSaved >= 0 ? g.startSaved : 0,
        deadline: Utils.isValidISODate(g.deadline) ? g.deadline : '',
        createdAt: Number(g.createdAt) || Date.now(),
        ...(g.demo ? { demo: true } : {}),
      }))),

    settings: (obj) => {
      const source = isObject(obj) ? obj : {};
      const def = defaults().settings;
      return {
        ...def,
        ...source,
        userName: isText(source.userName) ? source.userName.slice(0, 30) : '',
        availableHorizon: AVAILABLE_HORIZONS.includes(source.availableHorizon) ? source.availableHorizon : def.availableHorizon,
        chartRange: Finance.RANGES[source.chartRange] ? source.chartRange : def.chartRange,
        schemaVersion: SCHEMA_VERSION,
      };
    },
  };

  /** Versión con la que se guardaron unos datos (los de la v1.0 llevan schemaVersion: 1) */
  function versionOf(settings) {
    return isObject(settings) && Number.isInteger(settings.schemaVersion) && settings.schemaVersion > 0
      ? settings.schemaVersion
      : 1;
  }

  /** Copia de seguridad de los datos tal y como estaban antes de migrarlos */
  function saveMigrationBackup(raw, fromVersion) {
    try {
      localStorage.setItem(PREFIX + BACKUP_KEY, JSON.stringify({
        app: 'MyBudget',
        schemaVersion: fromVersion,
        migratedTo: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        data: raw,
      }));
    } catch (error) {
      // Si no cabe, la migración sigue adelante: solo añade campos y no borra nada
      console.warn('No se pudo guardar la copia previa a la migración', error);
    }
  }

  /* ---------- API pública ---------- */

  /**
   * Carga todos los datos en memoria y migra los de versiones anteriores.
   * Devuelve { isFirstRun, migratedFrom (versión anterior o null), newerVersion, readErrors }.
   */
  function init() {
    readErrors = 0;
    const raw = {};
    COLLECTIONS.forEach((key) => { raw[key] = read(key); });
    const isFirstRun = raw.settings === undefined;
    const storedVersion = isFirstRun ? SCHEMA_VERSION : versionOf(raw.settings);

    let source = raw;
    let migratedFrom = null;
    if (storedVersion < SCHEMA_VERSION) {
      saveMigrationBackup(raw, storedVersion);
      source = Migrations.run(raw, storedVersion, SCHEMA_VERSION);
      migratedFrom = storedVersion;
    }

    const def = defaults();
    COLLECTIONS.forEach((key) => {
      cache[key] = source[key] === undefined ? def[key] : sanitizers[key](source[key]);
    });
    // Si la escritura falla, los datos originales siguen intactos y se volverá a intentar al abrir la app.
    // Las claves que existen pero no se han podido leer (JSON dañado) no se sobrescriben nunca.
    if (isFirstRun || migratedFrom) {
      const values = {};
      COLLECTIONS.forEach((key) => {
        if (raw[key] !== undefined || rawString(key) === null) values[key] = cache[key];
      });
      writeMany(values);
    }

    if (!listening) {
      window.addEventListener('storage', handleExternalChange);
      listening = true;
    }
    return { isFirstRun, migratedFrom, newerVersion: storedVersion > SCHEMA_VERSION, readErrors };
  }

  /** Vuelve a leer una colección de LocalStorage y la pasa por su sanitizer */
  function reload(key) {
    const stored = read(key);
    cache[key] = stored === undefined ? defaults()[key] : sanitizers[key](stored);
  }

  /**
   * Sincroniza entre pestañas. El navegador lanza el evento "storage" en las demás pestañas
   * abiertas cuando una de ellas modifica LocalStorage (nunca en la que hizo el cambio).
   */
  function handleExternalChange(event) {
    if (event.storageArea !== localStorage) return;

    // key === null → otra pestaña ha ejecutado localStorage.clear()
    if (event.key === null) {
      COLLECTIONS.forEach(reload);
      notify('all');
      return;
    }
    if (!event.key.startsWith(PREFIX)) return;

    const key = event.key.slice(PREFIX.length);
    if (COLLECTIONS.includes(key)) {
      reload(key);
      notify(key);
    } else if (key === 'theme') {
      notify('theme'); // el tema no tiene caché: lo aplica App
    }
  }

  function get(key) {
    return cache[key];
  }

  /** Guarda una colección completa y avisa a los suscriptores */
  function set(key, value, { silent = false } = {}) {
    cache[key] = value;
    write(key, value);
    if (!silent) notify(key);
  }

  /**
   * Guarda varias colecciones a la vez con una única notificación.
   * Con atomic: true, si no se pueden guardar todas no se cambia nada (ni en LocalStorage ni en
   * memoria) y se lanza un Error. Se usa al importar para no mezclar datos viejos y nuevos.
   */
  function setMany(values, { atomic = false } = {}) {
    const ok = writeMany(values);
    if (!ok && atomic) {
      throw new Error('No hay espacio suficiente en el almacenamiento del navegador. No se ha modificado ningún dato.');
    }
    if (!ok) UI.toast('No se pudieron guardar los datos. El almacenamiento está lleno o bloqueado.', 'error');
    Object.assign(cache, values);
    notify('all');
    return ok;
  }

  function subscribe(fn) {
    listeners.push(fn);
  }

  function notify(key) {
    listeners.forEach((fn) => fn(key));
  }

  /* ---------- Tema ---------- */

  function getTheme() {
    return read('theme');
  }

  function setTheme(theme) {
    write('theme', theme);
  }

  /* ---------- Exportar / importar / borrar ---------- */

  function exportData() {
    const data = {};
    COLLECTIONS.forEach((key) => { data[key] = cache[key]; });
    data.theme = getTheme() || 'light';
    return {
      app: 'MyBudget',
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data,
    };
  }

  /** Extrae los datos de una copia de seguridad. Lanza un Error si no tiene el formato esperado. */
  function validateBackup(json) {
    const data = isObject(json) && isObject(json.data) ? json.data : json;
    if (!isObject(data) || !Array.isArray(data.transactions)) {
      throw new Error('El archivo no tiene el formato de MyBudget (falta la lista de movimientos).');
    }
    return data;
  }

  const SECTION_SHAPES = {
    categories: ['array', 'categorías'],
    recurring: ['array', 'gastos recurrentes'],
    goals: ['array', 'objetivos'],
    budgets: ['object', 'presupuestos'],
    settings: ['object', 'configuración'],
    receipts: ['array', 'recibos'],
  };

  /**
   * Analiza una copia de seguridad SIN modificar nada: comprueba su estructura y su versión,
   * migra los datos antiguos, los limpia y cuenta lo que se importará y lo que se descartará.
   * Lanza un Error con un mensaje comprensible si el archivo no se puede importar.
   */
  function inspectBackup(json) {
    const data = validateBackup(json);

    const errors = Object.entries(SECTION_SHAPES)
      .filter(([key, [shape]]) => data[key] !== undefined && !(shape === 'array' ? Array.isArray(data[key]) : isObject(data[key])))
      .map(([, [, label]]) => `La sección de ${label} no tiene un formato válido.`);
    if (errors.length) throw new Error(errors.join(' '));

    const version = Number.isInteger(json.schemaVersion) ? json.schemaVersion : versionOf(data.settings);
    if (version > SCHEMA_VERSION) {
      throw new Error(`El archivo es de una versión más reciente de MyBudget (formato v${version}). Actualiza la aplicación para importarlo.`);
    }

    // JSON.parse(JSON.stringify()) evita que las migraciones toquen el objeto original
    const migrated = Migrations.run(JSON.parse(JSON.stringify(data)), version, SCHEMA_VERSION);
    const def = defaults();
    const values = {};
    COLLECTIONS.forEach((key) => {
      values[key] = sanitizers[key](migrated[key] === undefined ? def[key] : migrated[key]);
    });

    // Recibos: solo imágenes válidas con un id correcto
    const receipts = uniqueById((data.receipts || []).filter((r) => r && isValidId(r.id)
      && Validate.isImageDataUrl(r.dataUrl) && r.dataUrl.length <= Receipts.MAX_DATA_URL_LENGTH))
      .map((r) => ({ id: r.id, dataUrl: r.dataUrl, createdAt: Number(r.createdAt) || Date.now() }));
    const receiptIds = new Set(receipts.map((r) => r.id));
    // Un movimiento no puede apuntar a un recibo que no viene en el archivo
    values.transactions = values.transactions.map((t) => {
      if (!t.receiptId || receiptIds.has(t.receiptId)) return t;
      const { receiptId, ...rest } = t;
      return rest;
    });

    const count = (key) => (Array.isArray(data[key]) ? data[key].length : 0);
    return {
      version,
      appVersion: isText(json.appVersion) ? json.appVersion : '',
      exportedAt: isText(json.exportedAt) ? json.exportedAt : '',
      theme: data.theme === 'light' || data.theme === 'dark' ? data.theme : null,
      values,
      receipts,
      summary: {
        transactions: { total: count('transactions'), valid: values.transactions.length },
        recurring: { total: count('recurring'), valid: values.recurring.length },
        goals: { total: count('goals'), valid: values.goals.length },
        receipts: { total: count('receipts'), valid: receipts.length },
        customCategories: values.categories.filter((c) => c.custom).length,
        monthlyBudget: values.budgets.monthly,
        categoryLimits: Object.keys(values.budgets.byCategory).length,
      },
    };
  }

  /**
   * Sustituye todos los datos por los de una copia analizada con inspectBackup().
   * Es atómico: si no se puede guardar todo, no cambia nada y lanza un Error.
   */
  function applyImport(inspection) {
    setMany(inspection.values, { atomic: true });
    if (inspection.theme) setTheme(inspection.theme);
    const { transactions } = inspection.summary;
    return { transactions: transactions.valid, discarded: transactions.total - transactions.valid };
  }

  /** Sustituye todos los datos por los del objeto importado. Lanza un Error si no es válido. */
  function importData(json) {
    return applyImport(inspectBackup(json));
  }

  /** Borra todos los datos (se conserva el tema) y deja la app vacía, sin datos de ejemplo */
  function clearAll() {
    const values = defaults();
    values.settings.demoLoaded = false;
    setMany(values);
  }

  /** Copia de los datos previa a la última migración (o null si no hay) */
  function getMigrationBackup() {
    const backup = read(BACKUP_KEY);
    return isObject(backup) && isObject(backup.data) ? backup : null;
  }

  function clearMigrationBackup() {
    try {
      localStorage.removeItem(PREFIX + BACKUP_KEY);
    } catch { /* almacenamiento no disponible */ }
  }

  /** Tamaño aproximado ocupado en LocalStorage (en bytes) */
  function usage() {
    let bytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(PREFIX)) bytes += (key.length + localStorage.getItem(key).length) * 2;
      }
    } catch (error) { /* almacenamiento no disponible */ }
    return bytes;
  }

  return {
    SCHEMA_VERSION, APP_VERSION, AVAILABLE_HORIZONS, ID_PATTERN,
    init, get, set, setMany, subscribe, getTheme, setTheme,
    exportData, validateBackup, inspectBackup, applyImport, importData, clearAll,
    getMigrationBackup, clearMigrationBackup, usage, defaults,
  };
})();
