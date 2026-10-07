/**
 * migrations.js
 * Migraciones del formato de los datos guardados (Store.SCHEMA_VERSION).
 *
 * Cada migración recibe los datos tal y como se guardaban en la versión anterior
 * ({ transactions, categories, budgets, recurring, goals, settings }; alguna colección puede faltar)
 * y devuelve una copia con el formato de su versión. Nunca borran información: solo añaden
 * campos nuevos con valores por defecto. Después, los sanitizers de storage.js validan el resultado.
 *
 * Se aplican al abrir la app con datos de una versión anterior y al importar copias antiguas.
 *
 * Historial:
 *   v1 · MyBudget 1.0
 *   v2 · MyBudget 1.1 → objetivos con "startSaved" (ritmo de ahorro), preferencias de "dinero
 *        disponible" y de la gráfica de evolución, y recibos opcionales en los movimientos (receiptId)
 */
const Migrations = (() => {
  const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  const STEPS = {
    2(data) {
      return {
        ...data,
        // Se desconoce cuánto había ahorrado cada objetivo al crearlo: se toma 0 (el ritmo se mide desde cero)
        goals: Array.isArray(data.goals)
          ? data.goals.map((g) => (isObject(g) && g.startSaved === undefined ? { ...g, startSaved: 0 } : g))
          : data.goals,
        settings: {
          availableHorizon: 'month',
          chartRange: '6m',
          ...(isObject(data.settings) ? data.settings : {}),
          schemaVersion: 2,
        },
      };
    },
  };

  const LATEST = Math.max(...Object.keys(STEPS).map(Number));

  /** Aplica en orden las migraciones necesarias para pasar de la versión "from" a la "to" */
  function run(data, from, to = LATEST) {
    let result = { ...data };
    for (let version = from + 1; version <= to; version++) {
      if (STEPS[version]) result = STEPS[version](result);
    }
    return result;
  }

  return { run, LATEST };
})();
