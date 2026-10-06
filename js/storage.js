/**
 * storage.js
 * Única capa que habla con LocalStorage. El resto de módulos usa Store.get() / Store.set().
 *
 * Estructura en LocalStorage (cada colección en su propia clave):
 *   gestorGastos.transactions → [{ id, type, concept, amount, categoryId, date, method, notes, createdAt }]
 *   gestorGastos.categories   → [{ id, name, icon, type, color, custom }]
 *   gestorGastos.budgets      → { monthly, byCategory: { [categoryId]: cents } }
 *   gestorGastos.recurring    → [{ id, name, amount, categoryId, day, frequency, startMonth, method, active }]
 *   gestorGastos.goals        → [{ id, name, icon, target, saved, deadline, createdAt }]
 *   gestorGastos.settings     → { userName, demoLoaded, schemaVersion }
 *   gestorGastos.theme        → "light" | "dark"
 *
 * Todas las cantidades se guardan en céntimos (enteros).
 */
const Store = (() => {
  const PREFIX = 'gestorGastos.';
  const SCHEMA_VERSION = 1;
  const COLLECTIONS = ['transactions', 'categories', 'budgets', 'recurring', 'goals', 'settings'];

  const cache = {};       // copia en memoria para no leer LocalStorage constantemente
  const listeners = [];   // funciones a ejecutar cuando cambian los datos

  function defaults() {
    return {
      transactions: [],
      categories: Categories.defaults(),
      budgets: { monthly: 0, byCategory: {} },
      recurring: [],
      goals: [],
      settings: { userName: '', demoLoaded: false, schemaVersion: SCHEMA_VERSION },
    };
  }

  /* ---------- Lectura / escritura de bajo nivel ---------- */

  function read(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? undefined : JSON.parse(raw);
    } catch (error) {
      console.warn(`No se pudo leer "${key}"`, error);
      return undefined;
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

  /* ---------- Validación / limpieza de datos ---------- */

  const isText = (v) => typeof v === 'string';
  const isPositiveInt = (v) => Number.isInteger(v) && v > 0;

  const sanitizers = {
    transactions: (list) => (Array.isArray(list) ? list : [])
      .filter((t) => t && isText(t.id) && ['income', 'expense'].includes(t.type)
        && isPositiveInt(t.amount) && Utils.isValidISODate(t.date))
      .map((t) => ({
        id: t.id,
        type: t.type,
        concept: isText(t.concept) ? t.concept.slice(0, 80) : 'Sin concepto',
        amount: t.amount,
        categoryId: isText(t.categoryId) ? t.categoryId : '',
        date: t.date,
        method: isText(t.method) ? t.method : '',
        notes: isText(t.notes) ? t.notes.slice(0, 300) : '',
        createdAt: Number(t.createdAt) || Date.now(),
        ...(t.demo ? { demo: true } : {}),
      })),

    categories: (list) => {
      const valid = (Array.isArray(list) ? list : [])
        .filter((c) => c && isText(c.id) && isText(c.name) && ['income', 'expense'].includes(c.type))
        .map((c) => ({
          id: c.id,
          name: c.name.slice(0, 30),
          icon: isText(c.icon) && c.icon ? c.icon : '🏷️',
          type: c.type,
          color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#8b8d98',
          custom: Boolean(c.custom),
        }));
      // Nos aseguramos de que las categorías predeterminadas siempre existan
      Categories.defaults().forEach((def) => {
        if (!valid.some((c) => c.id === def.id)) valid.push(def);
      });
      return valid;
    },

    budgets: (obj) => {
      const result = { monthly: 0, byCategory: {} };
      if (obj && Number.isInteger(obj.monthly) && obj.monthly >= 0) result.monthly = obj.monthly;
      if (obj && obj.byCategory && typeof obj.byCategory === 'object') {
        Object.entries(obj.byCategory).forEach(([id, value]) => {
          if (isPositiveInt(value)) result.byCategory[id] = value;
        });
      }
      return result;
    },

    recurring: (list) => (Array.isArray(list) ? list : [])
      .filter((r) => r && isText(r.id) && isText(r.name) && isPositiveInt(r.amount)
        && Number.isInteger(r.day) && r.day >= 1 && r.day <= 31)
      .map((r) => ({
        id: r.id,
        name: r.name.slice(0, 60),
        amount: r.amount,
        categoryId: isText(r.categoryId) ? r.categoryId : '',
        day: r.day,
        frequency: Recurring.FREQUENCIES[r.frequency] ? r.frequency : 'monthly',
        startMonth: Utils.isValidMonthKey(r.startMonth) ? r.startMonth : Utils.currentMonthKey(),
        method: isText(r.method) ? r.method : '',
        active: r.active !== false,
        ...(r.demo ? { demo: true } : {}),
      })),

    goals: (list) => (Array.isArray(list) ? list : [])
      .filter((g) => g && isText(g.id) && isText(g.name) && isPositiveInt(g.target))
      .map((g) => ({
        id: g.id,
        name: g.name.slice(0, 60),
        icon: isText(g.icon) && g.icon ? g.icon : '🎯',
        target: g.target,
        saved: Number.isInteger(g.saved) && g.saved >= 0 ? g.saved : 0,
        deadline: Utils.isValidISODate(g.deadline) ? g.deadline : '',
        createdAt: Number(g.createdAt) || Date.now(),
        ...(g.demo ? { demo: true } : {}),
      })),

    settings: (obj) => ({
      ...defaults().settings,
      ...(obj && typeof obj === 'object' ? obj : {}),
      schemaVersion: SCHEMA_VERSION,
    }),
  };

  /* ---------- API pública ---------- */

  /** Carga todos los datos en memoria. Devuelve si es la primera vez que se abre la app. */
  function init() {
    const isFirstRun = read('settings') === undefined;
    const def = defaults();
    COLLECTIONS.forEach((key) => {
      const stored = read(key);
      cache[key] = stored === undefined ? def[key] : sanitizers[key](stored);
    });
    if (isFirstRun) COLLECTIONS.forEach((key) => write(key, cache[key]));
    return { isFirstRun };
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

  /** Guarda varias colecciones a la vez con una única notificación */
  function setMany(values) {
    Object.entries(values).forEach(([key, value]) => {
      cache[key] = value;
      write(key, value);
    });
    notify('all');
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
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data,
    };
  }

  /** Extrae los datos de una copia de seguridad. Lanza un Error si no tiene el formato esperado. */
  function validateBackup(json) {
    const data = json && typeof json === 'object' && json.data ? json.data : json;
    if (!data || typeof data !== 'object' || !Array.isArray(data.transactions)) {
      throw new Error('El archivo no tiene el formato de MyBudget (falta la lista de movimientos).');
    }
    return data;
  }

  /** Sustituye todos los datos por los del objeto importado. Lanza un Error si no es válido. */
  function importData(json) {
    const data = validateBackup(json);
    const def = defaults();
    const values = {};
    COLLECTIONS.forEach((key) => {
      values[key] = sanitizers[key](data[key] === undefined ? def[key] : data[key]);
    });
    if (data.theme === 'light' || data.theme === 'dark') setTheme(data.theme);
    setMany(values);
    return {
      transactions: values.transactions.length,
      discarded: data.transactions.length - values.transactions.length,
    };
  }

  /** Borra todos los datos (se conserva el tema) y deja la app vacía, sin datos de ejemplo */
  function clearAll() {
    const values = defaults();
    values.settings.demoLoaded = false;
    setMany(values);
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
    init, get, set, setMany, subscribe, getTheme, setTheme,
    exportData, validateBackup, importData, clearAll, usage, defaults,
  };
})();
