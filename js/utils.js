/**
 * utils.js
 * Funciones auxiliares reutilizables: dinero, fechas, DOM y utilidades varias.
 *
 * IMPORTANTE: todas las cantidades se guardan como CÉNTIMOS (números enteros).
 * Así evitamos errores típicos de coma flotante como 0.1 + 0.2 = 0.30000000000000004.
 */
const Utils = (() => {
  /* ---------------------------------------------------------------
   * DINERO
   * ------------------------------------------------------------- */

  /**
   * Convierte un texto o número a céntimos (entero).
   * Acepta "1.250,50", "1250,50", "1250.50", "1,250.50" o 1250.5. Devuelve NaN si no es válido.
   * Un punto seguido de exactamente 3 cifras ("2.000") se interpreta como separador de miles,
   * como se escribe en español.
   */
  function toCents(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? Math.round(value * 100) : NaN;
    }
    let str = String(value ?? '').trim().replace(/[\s€ ]/g, '');
    if (!str) return NaN;

    // Los separadores de miles solo son válidos en grupos de 3 cifras: "1.250.000", no "1.2.3"
    const isGrouped = (integer, sep) => new RegExp(`^-?\\d{1,3}(\\${sep}\\d{3})+$`).test(integer);

    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      // El último separador es el decimal; el otro es de miles
      const pos = Math.max(lastComma, lastDot);
      const thousandsSep = lastComma > lastDot ? '.' : ',';
      const integer = str.slice(0, pos);
      if (!isGrouped(integer, thousandsSep)) return NaN;
      str = `${integer.split(thousandsSep).join('')}.${str.slice(pos + 1)}`;
    } else if (lastComma > -1) {
      str = str.replace(',', '.'); // si hay más de una coma, la comprobación final lo rechaza
    } else if ((str.match(/\./g) || []).length > 1 || /^-?\d{1,3}\.\d{3}$/.test(str)) {
      if (!isGrouped(str, '.')) return NaN;
      str = str.replace(/\./g, ''); // "1.250.000" o "2.000" → miles
    }

    const match = str.match(/^(-)?(\d*)(?:\.(\d*))?$/);
    if (!match || (!match[2] && !match[3])) return NaN;

    // Cálculo con enteros para no perder precisión
    const integer = parseInt(match[2] || '0', 10);
    const decimals = (match[3] || '').padEnd(3, '0');
    let cents = integer * 100 + parseInt(decimals.slice(0, 2), 10);
    if (parseInt(decimals[2], 10) >= 5) cents += 1;
    return match[1] ? -cents : cents;
  }

  /** Céntimos → texto para rellenar un campo de cantidad ("1250,50"). toCents() lo vuelve a leer. */
  function centsToInput(cents) {
    return (cents / 100).toFixed(2).replace('.', ',');
  }

  /** Céntimos → euros (número), útil para las gráficas */
  function centsToEuros(cents) {
    return Math.round(cents) / 100;
  }

  /**
   * Descompone una cantidad para poder mostrarla por partes:
   * 125050 → { sign: '', integer: '1.250', decimals: '50' }. Con decimals = false se redondea a euros.
   */
  function moneyParts(cents, { sign = false, decimals = true } = {}) {
    const value = Math.round(Number(cents) || 0);
    const abs = Math.abs(value);
    const euros = decimals ? Math.floor(abs / 100) : Math.round(abs / 100);
    return {
      sign: value < 0 ? '-' : (sign && value > 0 ? '+' : ''),
      integer: String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
      decimals: decimals ? String(abs % 100).padStart(2, '0') : '',
    };
  }

  /**
   * Formatea céntimos con formato español: 125050 → "1.250,50 €".
   * No usamos Intl porque en es-ES no agrupa los números de 4 cifras (1250,50 €).
   */
  function formatMoney(cents, options = {}) {
    const p = moneyParts(cents, options);
    return `${p.sign}${p.integer}${p.decimals ? `,${p.decimals}` : ''} €`;
  }

  /** Formatea un porcentaje: 42.5 → "42,5 %" */
  function formatPercent(value, digits = 1) {
    if (!Number.isFinite(value)) return '—';
    return `${value.toFixed(digits).replace('.', ',')} %`;
  }

  /** Porcentaje seguro (evita dividir entre 0) */
  function percent(part, total) {
    return total > 0 ? (part / total) * 100 : 0;
  }

  /* ---------------------------------------------------------------
   * FECHAS (formato ISO "AAAA-MM-DD" en hora local)
   * ------------------------------------------------------------- */

  const pad = (n) => String(n).padStart(2, '0');

  function toISODate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function todayISO() {
    return toISODate(new Date());
  }

  /** "2026-10-06" → Date local (sin desfase de zona horaria) */
  function parseISODate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function isValidISODate(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const date = parseISODate(iso);
    return toISODate(date) === iso && date.getFullYear() >= 1900 && date.getFullYear() <= 2100;
  }

  function isValidMonthKey(key) {
    return typeof key === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
  }

  const dateFormatter = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  const dateLongFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dayMonthFormatter = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

  /** "2026-10-06" → "06 oct 2026" */
  function formatDate(iso, style = 'short') {
    if (!isValidISODate(iso)) return '—';
    const date = parseISODate(iso);
    if (style === 'long') return capitalize(dateLongFormatter.format(date));
    if (style === 'dayMonth') return dayMonthFormatter.format(date);
    return dateFormatter.format(date).replace('.', '');
  }

  /** "2026-10-06" → "2026-10" */
  function monthKey(iso) {
    return iso.slice(0, 7);
  }

  function currentMonthKey() {
    return monthKey(todayISO());
  }

  /** Suma (o resta) meses a una clave "AAAA-MM" */
  function addMonths(key, amount) {
    const [y, m] = key.split('-').map(Number);
    const date = new Date(y, m - 1 + amount, 1);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }

  /** Número de meses entre dos claves (b - a) */
  function monthDiff(a, b) {
    const [ya, ma] = a.split('-').map(Number);
    const [yb, mb] = b.split('-').map(Number);
    return (yb - ya) * 12 + (mb - ma);
  }

  function daysInMonth(key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }

  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /** "2026-10" → "Octubre 2026" (o "Oct" en formato corto) */
  function monthLabel(key, short = false) {
    const [y, m] = key.split('-').map(Number);
    const name = MONTHS[m - 1];
    return short ? capitalize(name.slice(0, 3)) : `${capitalize(name)} ${y}`;
  }

  /** Suma (o resta) días a una fecha ISO: addDays("2026-10-30", 3) → "2026-11-02" */
  function addDays(iso, amount) {
    const date = parseISODate(iso);
    date.setDate(date.getDate() + amount);
    return toISODate(date);
  }

  /** Días entre dos fechas ISO (b - a). Math.round compensa los cambios de horario de verano */
  function daysBetween(a, b) {
    return Math.round((parseISODate(b) - parseISODate(a)) / 86400000);
  }

  /** Último día de un mes: "2026-02" → "2026-02-28" */
  function monthEnd(key) {
    return `${key}-${pad(daysInMonth(key))}`;
  }

  /** Días entre hoy y una fecha ISO (negativo si ya pasó) */
  function daysUntil(iso) {
    return daysBetween(todayISO(), iso);
  }

  /** Texto relativo: "Hoy", "Mañana", "En 5 días" */
  function relativeDays(iso) {
    const days = daysUntil(iso);
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Mañana';
    if (days === -1) return 'Ayer';
    return days > 0 ? `En ${days} días` : `Hace ${-days} días`;
  }

  /* ---------------------------------------------------------------
   * DOM
   * ------------------------------------------------------------- */

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  /** Escapa texto del usuario antes de insertarlo como HTML (evita XSS) */
  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------------------------------------------------------------
   * VARIOS
   * ------------------------------------------------------------- */

  function uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  }

  /** Normaliza texto para búsquedas: minúsculas y sin tildes */
  function normalize(text) {
    return String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function debounce(fn, wait = 250) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function sumBy(list, getter) {
    return list.reduce((total, item) => total + getter(item), 0);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /** Tamaño legible: 2048 → "2,0 KB", 3145728 → "3,0 MB" */
  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  }

  /** Descarga un archivo generado en el navegador */
  function downloadFile(filename, content, mime = 'application/json') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    toCents, centsToInput, centsToEuros, moneyParts, formatMoney, formatPercent, percent,
    toISODate, todayISO, parseISODate, isValidISODate, isValidMonthKey, formatDate,
    monthKey, currentMonthKey, addMonths, monthDiff, daysInMonth, monthEnd, monthLabel,
    addDays, daysBetween, daysUntil, relativeDays,
    $, $$, escapeHTML, uid, capitalize, normalize, debounce, sumBy, clamp, formatBytes, downloadFile,
  };
})();
