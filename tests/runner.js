/**
 * runner.js
 * Mini test runner sin dependencias.
 *
 * Uso:
 *   Test.describe('Grupo', () => {
 *     Test.it('hace algo', () => {
 *       Test.equal(sumar(1, 2), 3);
 *     });
 *   });
 *   Test.itAsync('lee un archivo', async () => { … });  // tests asíncronos
 *   Test.render(); // ejecuta los tests asíncronos y pinta los resultados en la página
 *
 * Los tests asíncronos no se ejecutan al declararlos: se guardan y se ejecutan uno detrás de otro
 * en render(), cuando ya han terminado los síncronos. Así nunca se pisan los datos entre sí.
 */
const Test = (() => {
  const groups = [];
  const queue = []; // tests asíncronos pendientes: { test, fn }
  let current = null;

  /** Muestra un valor en los mensajes de error (NaN y textos se ven tal cual) */
  function show(value) {
    if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
    if (value === undefined) return 'undefined';
    return JSON.stringify(value);
  }

  /** Igualdad profunda sencilla (vale para números, textos, arrays y objetos planos) */
  function same(a, b) {
    if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return true;
    return show(a) === show(b);
  }

  function describe(name, fn) {
    current = { name, tests: [] };
    groups.push(current);
    fn();
    current = null;
  }

  function it(name, fn) {
    const test = { name, ok: true, error: '' };
    try {
      fn();
    } catch (error) {
      test.ok = false;
      test.error = error.message;
    }
    current.tests.push(test);
  }

  /** Test asíncrono (fn devuelve una promesa). Falla si la promesa se rechaza o tarda más de 10 s */
  function itAsync(name, fn) {
    const test = { name, ok: true, error: '' };
    current.tests.push(test);
    queue.push({ test, fn });
  }

  async function runQueue() {
    while (queue.length) {
      const { test, fn } = queue.shift();
      try {
        await Promise.race([
          fn(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('tiempo agotado (10 s)')), 10000)),
        ]);
      } catch (error) {
        test.ok = false;
        test.error = error.message;
      }
    }
  }

  /* ---------- Aserciones ---------- */

  function equal(actual, expected, message = '') {
    if (!same(actual, expected)) {
      throw new Error(`${message ? `${message}: ` : ''}se esperaba ${show(expected)} y se obtuvo ${show(actual)}`);
    }
  }

  /** Para resultados con decimales (porcentajes) */
  function close(actual, expected, tolerance = 1e-6, message = '') {
    if (typeof actual !== 'number' || Math.abs(actual - expected) > tolerance) {
      throw new Error(`${message ? `${message}: ` : ''}se esperaba ≈${expected} y se obtuvo ${show(actual)}`);
    }
  }

  function ok(condition, message = 'la condición no se cumple') {
    if (!condition) throw new Error(message);
  }

  /* ---------- Resultados ---------- */

  function summary() {
    const all = groups.flatMap((g) => g.tests.map((t) => ({ ...t, group: g.name })));
    const failures = all.filter((t) => !t.ok);
    return { total: all.length, passed: all.length - failures.length, failed: failures.length, failures };
  }

  function escape(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  async function render(root = document.getElementById('results')) {
    await runQueue();
    const result = summary();
    const allOk = result.failed === 0;

    root.innerHTML = `
      <p class="summary ${allOk ? 'is-ok' : 'is-fail'}">
        ${allOk ? '✓' : '✗'} ${result.passed} de ${result.total} tests correctos
        ${allOk ? '' : `· <strong>${result.failed} fallidos</strong>`}
      </p>
      ${groups.map((g) => {
        const failed = g.tests.filter((t) => !t.ok).length;
        return `
          <details class="group" ${failed ? 'open' : ''}>
            <summary>
              <span class="${failed ? 'fail' : 'ok'}">${failed ? '✗' : '✓'}</span>
              ${escape(g.name)} <span class="count">${g.tests.length - failed}/${g.tests.length}</span>
            </summary>
            <ul>${g.tests.map((t) => `
              <li class="${t.ok ? 'ok' : 'fail'}">
                ${t.ok ? '✓' : '✗'} ${escape(t.name)}
                ${t.ok ? '' : `<pre>${escape(t.error)}</pre>`}
              </li>`).join('')}
            </ul>
          </details>`;
      }).join('')}`;

    document.title = `${allOk ? '✓' : '✗'} ${result.passed}/${result.total} · Tests MyBudget`;
    // Disponible para herramientas automáticas (p. ej. un navegador headless)
    window.testResults = result;
    return result;
  }

  return { describe, it, itAsync, equal, close, ok, render, summary };
})();
