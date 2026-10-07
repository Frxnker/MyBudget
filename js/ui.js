/**
 * ui.js
 * Componentes de interfaz reutilizables: notificaciones (toasts), ventanas modales,
 * confirmaciones, errores de formulario y pequeños bloques HTML comunes.
 */
const UI = (() => {
  const { $, escapeHTML } = Utils;

  /* ---------------------------------------------------------------
   * TOASTS
   * ------------------------------------------------------------- */
  const TOAST_ICONS = { success: 'check', error: 'alert', warning: 'alert', info: 'info' };

  /**
   * Muestra una notificación. "action" es opcional: { label: 'Deshacer', onClick: () => {...} }
   */
  function toast(message, type = 'success', duration = 3200, action = null) {
    const container = $('#toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `
      <span class="toast-icon">${Icons.get(TOAST_ICONS[type] || 'info', 18)}</span>
      <span class="toast-message" title="${escapeHTML(message)}">${escapeHTML(message)}</span>
      ${action ? `<button class="toast-action">${escapeHTML(action.label)}</button>` : ''}
      <button class="toast-close" aria-label="Cerrar notificación">${Icons.get('x', 16)}</button>`;
    container.appendChild(el);

    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      el.classList.add('is-leaving');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    };
    el.querySelector('.toast-close').addEventListener('click', remove);
    if (action) {
      el.querySelector('.toast-action').addEventListener('click', () => {
        action.onClick();
        remove();
      });
    }
    setTimeout(remove, duration);

    // Como máximo 3 avisos a la vez: si hay más, se cierra el más antiguo
    const visible = [...container.querySelectorAll('.toast:not(.is-leaving)')];
    if (visible.length > 3) visible[0].querySelector('.toast-close').click();
  }

  /* ---------------------------------------------------------------
   * MODALES (<dialog>)
   * ------------------------------------------------------------- */

  function openModal(id) {
    const dialog = document.getElementById(id);
    if (!dialog.open) dialog.showModal();
    // Enfocamos el primer campo editable
    const first = dialog.querySelector('input:not([type=radio]):not([type=hidden]), select, textarea');
    if (first) setTimeout(() => first.focus(), 50);
  }

  function closeModal(id) {
    const dialog = typeof id === 'string' ? document.getElementById(id) : id;
    if (dialog && dialog.open) dialog.close();
  }

  /** Botones [data-close] y clic fuera del contenido cierran el modal */
  function initModals() {
    document.querySelectorAll('dialog.modal').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target.closest('[data-close]')) closeModal(dialog);
        // Clic sobre el fondo (el propio <dialog>, fuera de su contenido)
        if (event.target === dialog) closeModal(dialog);
      });
      dialog.addEventListener('close', () => {
        const form = dialog.querySelector('form');
        if (form) clearErrors(form);
      });
    });
  }

  /**
   * Menú de acciones en forma de hoja inferior (se usa en móvil).
   * Cada opción es { label, icon, action, id, danger }: el botón lleva data-action / data-id,
   * así que la acción la ejecuta el mismo manejador global que el resto de botones (app.js).
   */
  function actionSheet({ title, subtitle = '', media = '', items }) {
    $('#action-sheet-header').innerHTML = `
      ${media}
      <div class="grow">
        <h2 id="action-sheet-title">${escapeHTML(title)}</h2>
        ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}
      </div>`;
    $('#action-sheet-list').innerHTML = items.map((item) => `
      <button type="button" class="action-sheet-item ${item.danger ? 'is-danger' : ''}" data-close
        data-action="${escapeHTML(item.action)}" ${item.id ? `data-id="${escapeHTML(item.id)}"` : ''}>
        ${Icons.get(item.icon, 20)}<span>${escapeHTML(item.label)}</span>
      </button>`).join('');
    openModal('action-sheet');
    // El foco va a la hoja (no a la primera opción) para que no aparezca resaltada al tocar
    $('#action-sheet').focus();
  }

  function isAnyModalOpen() {
    return Boolean(document.querySelector('dialog[open]'));
  }

  /* ---------------------------------------------------------------
   * CONFIRMACIÓN (devuelve una Promesa con true/false)
   * ------------------------------------------------------------- */

  function confirm({ title = '¿Estás seguro?', message = '', confirmText = 'Eliminar', danger = true } = {}) {
    return new Promise((resolve) => {
      const dialog = $('#confirm-modal');
      const accept = $('#confirm-accept');
      const cancel = $('#confirm-cancel');
      $('#confirm-title').textContent = title;
      $('#confirm-message').textContent = message;
      accept.textContent = confirmText;
      accept.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
      $('#confirm-icon').className = `confirm-icon ${danger ? 'is-danger' : 'is-info'}`;

      let result = false;
      const finish = (value) => { result = value; dialog.close(); };
      const onAccept = () => finish(true);
      const onCancel = () => finish(false);
      const onBackdrop = (event) => { if (event.target === dialog) finish(false); };

      accept.addEventListener('click', onAccept);
      cancel.addEventListener('click', onCancel);
      dialog.addEventListener('click', onBackdrop);
      dialog.addEventListener('close', () => {
        accept.removeEventListener('click', onAccept);
        cancel.removeEventListener('click', onCancel);
        dialog.removeEventListener('click', onBackdrop);
        resolve(result);
      }, { once: true });

      dialog.showModal();
      cancel.focus();
    });
  }

  /* ---------------------------------------------------------------
   * ERRORES DE FORMULARIO
   * ------------------------------------------------------------- */

  function clearErrors(form) {
    form.querySelectorAll('.is-invalid').forEach((el) => {
      el.classList.remove('is-invalid');
      el.removeAttribute('aria-invalid');
    });
    form.querySelectorAll('.field-error').forEach((el) => el.remove());
  }

  /**
   * Muestra los errores bajo cada campo. "errors" es un objeto { nombreCampo: mensaje }.
   * Devuelve true si no había errores.
   */
  function showErrors(form, errors) {
    clearErrors(form);
    const entries = Object.entries(errors);
    entries.forEach(([name, message]) => {
      const input = form.elements[name];
      if (!input) return;
      const field = input.closest('.field') || input.parentElement;
      input.classList.add('is-invalid');
      input.setAttribute('aria-invalid', 'true');
      const error = document.createElement('p');
      error.className = 'field-error';
      error.textContent = message;
      field.appendChild(error);
    });
    if (entries.length) {
      const first = form.elements[entries[0][0]];
      if (first && first.focus) first.focus();
      return false;
    }
    return true;
  }

  /** Al escribir en un campo con error, quitamos su mensaje */
  function liveClearErrors(form) {
    form.addEventListener('input', (event) => {
      const input = event.target;
      if (!input.classList.contains('is-invalid')) return;
      input.classList.remove('is-invalid');
      input.removeAttribute('aria-invalid');
      const error = input.closest('.field')?.querySelector('.field-error');
      if (error) error.remove();
    });
  }

  /** Valida una cantidad en euros. Devuelve { cents } o { error } (ver validation.js) */
  function validateAmount(raw, options) {
    return Validate.amount(raw, options);
  }

  /* ---------------------------------------------------------------
   * BLOQUES HTML REUTILIZABLES
   * ------------------------------------------------------------- */

  function emptyState({ icon = 'inbox', title, text = '', action = '' }) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${Icons.get(icon, 28)}</div>
        <h3>${escapeHTML(title)}</h3>
        ${text ? `<p>${escapeHTML(text)}</p>` : ''}
        ${action}
      </div>`;
  }

  /** Nivel de alerta de una barra de progreso de gasto */
  function budgetLevel(pct) {
    if (pct > 100) return 'over';
    if (pct >= 80) return 'warn';
    return 'ok';
  }

  /**
   * Barra de progreso. "level" puede ser ok | warn | over | goal.
   * "marker" (opcional) dibuja una marca vertical en ese porcentaje, p. ej. el ritmo de gasto ideal.
   */
  function progressBar(pct, level = 'ok', label = '', { marker = null, markerLabel = '' } = {}) {
    const width = Utils.clamp(pct, 0, 100);
    return `
      <div class="progress progress-${level}" role="progressbar" aria-valuemin="0" aria-valuemax="100"
           aria-valuenow="${Math.round(pct)}" ${label ? `aria-label="${escapeHTML(label)}"` : ''}>
        <div class="progress-track"><div class="progress-bar" style="--progress:${width}%"></div></div>
        ${marker === null ? '' : `<span class="progress-marker" style="--marker:${Utils.clamp(marker, 0, 100)}%" title="${escapeHTML(markerLabel)}"></span>`}
      </div>`;
  }

  /** Anillo de progreso circular en SVG (objetivos de ahorro) */
  function ring(pct, { size = 64, stroke = 7, label = '' } = {}) {
    const center = size / 2;
    const radius = (size - stroke) / 2;
    const length = 2 * Math.PI * radius;
    const offset = length * (1 - Utils.clamp(pct, 0, 100) / 100);
    return `
      <svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeHTML(label)}">
        <circle class="ring-track" cx="${center}" cy="${center}" r="${radius}" stroke-width="${stroke}" fill="none"/>
        <circle class="ring-value" cx="${center}" cy="${center}" r="${radius}" stroke-width="${stroke}" fill="none"
          stroke-linecap="round" stroke-dasharray="${length.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
          style="--ring-length:${length.toFixed(2)}" transform="rotate(-90 ${center} ${center})"/>
      </svg>`;
  }

  /**
   * Mini gráfica de línea en SVG, sin Chart.js (p. ej. la evolución del saldo).
   * Ocupa todo el ancho disponible con una altura fija (la define el CSS) y toma el color de "currentColor".
   * El punto final es un elemento aparte para que no se deforme al estirar la gráfica.
   */
  let sparklineCount = 0;
  function sparkline(values, { label = '' } = {}) {
    if (values.length < 2) return '';
    const width = 100;
    const height = 40;
    const min = Math.min(...values);
    const range = Math.max(...values) - min || 1;
    const points = values.map((value, i) => [
      (i / (values.length - 1)) * width,
      4 + (height - 8) * (1 - (value - min) / range),
    ]);
    const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    const [lastX, lastY] = points[points.length - 1];
    const gradient = `sparkline-${++sparklineCount}`;
    return `
      <div class="sparkline" role="img" aria-label="${escapeHTML(label)}">
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="${gradient}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="currentColor" stop-opacity="0.3"/>
              <stop offset="1" stop-color="currentColor" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="${line} L${width} ${height} L0 ${height} Z" fill="url(#${gradient})"/>
          <path d="${line}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
            stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
        </svg>
        <span class="sparkline-dot" style="left:${lastX.toFixed(2)}%;top:${((lastY / height) * 100).toFixed(2)}%"></span>
      </div>`;
  }

  /**
   * Cantidad destacada: los céntimos y el símbolo se muestran más pequeños (1.250,50 €).
   * Para cifras grandes (KPIs, saldo…); en tablas y listas se usa Utils.formatMoney.
   */
  function money(cents, { sign = false } = {}) {
    const p = Utils.moneyParts(cents, { sign });
    return `<span class="money">${p.sign}${p.integer}<span class="money-minor">,${p.decimals} €</span></span>`;
  }

  /** Tarjeta de indicador (KPI). "value" y "foot" pueden contener HTML generado por la app */
  function kpi({ label, value, icon = '', tone = '', foot = '' }) {
    return `
      <div class="kpi ${tone ? `kpi-${tone}` : ''}">
        <div class="kpi-top">
          ${icon ? `<span class="kpi-icon">${Icons.get(icon, 16)}</span>` : ''}
          <span class="kpi-label">${label}</span>
        </div>
        <strong class="kpi-value">${value}</strong>
        ${foot ? `<div class="kpi-foot">${foot}</div>` : ''}
      </div>`;
  }

  /** Fecha con aspecto de hoja de calendario (mes + día) */
  function dateTile(iso) {
    return `<span class="date-tile" aria-hidden="true"><small>${Utils.monthLabel(iso.slice(0, 7), true)}</small><strong>${Number(iso.slice(8, 10))}</strong></span>`;
  }

  /** Etiqueta de categoría con un punto de su color */
  function categoryChip(category) {
    return `<span class="cat-chip" style="--cat-color:${category.color}"><span class="cat-dot"></span>${escapeHTML(category.name)}</span>`;
  }

  /** Icono circular de categoría con su color */
  function categoryBadge(category, size = 'md') {
    return `<span class="cat-icon cat-icon-${size}" style="--cat-color:${category.color}" aria-hidden="true">${escapeHTML(category.icon)}</span>`;
  }

  /** Indicador de tendencia respecto al mes anterior. "goodWhenUp" indica si subir es positivo */
  function trendBadge(change, goodWhenUp = true) {
    if (change === null || !Number.isFinite(change)) {
      return '<span class="trend trend-neutral">Sin datos del mes anterior</span>';
    }
    if (Math.abs(change) < 0.05) return '<span class="trend trend-neutral">Igual que el mes anterior</span>';
    const up = change > 0;
    const good = up === goodWhenUp;
    return `
      <span class="trend ${good ? 'trend-good' : 'trend-bad'}">
        <span class="trend-chip">${Icons.get(up ? 'arrowUp' : 'arrowDown', 12)}${Utils.formatPercent(Math.abs(change))}</span>
        <span class="trend-text">vs. mes anterior</span>
      </span>`;
  }

  /**
   * Comparación con un periodo anterior para el pie de un KPI: "↓ 8,2 % · vs. 742 € en sep."
   * La flecha y el texto indican la dirección (no solo el color). "goodWhenUp" indica si subir es bueno.
   */
  function compareFoot(current, previous, { goodWhenUp = true, label = '', points = false } = {}) {
    const where = label ? ` ${escapeHTML(label)}` : '';
    if (previous === null || previous === undefined || !Number.isFinite(previous)) {
      return '<span class="trend trend-neutral">Sin datos del periodo anterior</span>';
    }
    const reference = points
      ? `vs. ${Utils.formatPercent(previous)}`
      : `vs. ${Utils.formatMoney(previous, { decimals: Math.abs(previous) < 100000 })}`;
    const diff = current - previous;
    // Sin referencia (0 €) no hay porcentaje: solo se muestra el valor anterior
    if (!points && previous === 0) {
      return `<span class="trend trend-neutral"><span class="trend-text">${reference}${where}</span></span>`;
    }
    if (Math.abs(diff) < (points ? 0.05 : 1)) {
      return `<span class="trend trend-neutral"><span class="trend-chip">= Igual</span><span class="trend-text">${reference}${where}</span></span>`;
    }
    const up = diff > 0;
    const value = points
      ? `${Math.abs(diff).toFixed(1).replace('.', ',')} pts`
      : Utils.formatPercent(Math.abs((diff / Math.abs(previous)) * 100));
    return `
      <span class="trend ${up === goodWhenUp ? 'trend-good' : 'trend-bad'}">
        <span class="trend-chip">${Icons.get(up ? 'arrowUp' : 'arrowDown', 12)}<span class="sr-only">${up ? 'Sube' : 'Baja'} </span>${value}</span>
        <span class="trend-text">${reference}${where}</span>
      </span>`;
  }

  /** Mensaje de estado con icono y texto (ok | warn | over | info), nunca solo con color */
  function statusNote(level, html, icon = null) {
    const icons = { ok: 'check', warn: 'alert', over: 'alert', info: 'info' };
    return `<p class="status-note status-note-${level}">${Icons.get(icon || icons[level] || 'info', 16)}<span>${html}</span></p>`;
  }

  /**
   * Grupo de botones para elegir una opción (p. ej. el periodo de una gráfica).
   * options: [{ value, label, short }] · cada botón lleva data-action y data-id = value
   */
  function choiceGroup({ action, options, selected, label }) {
    return `
      <div class="choice-group" role="group" aria-label="${escapeHTML(label)}">
        ${options.map((o) => `
          <button type="button" class="choice ${o.value === selected ? 'is-active' : ''}" data-action="${escapeHTML(action)}"
            data-id="${escapeHTML(o.value)}" aria-pressed="${o.value === selected}">
            ${o.short ? `<span class="label-long">${escapeHTML(o.label)}</span><span class="label-short" aria-hidden="true">${escapeHTML(o.short)}</span>` : escapeHTML(o.label)}
          </button>`).join('')}
      </div>`;
  }

  /** Estado de "cargando" en un botón */
  function setLoading(button, loading, text = 'Procesando…') {
    if (loading) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner spinner-sm" aria-hidden="true"></span>${escapeHTML(text)}`;
    } else if (button.dataset.originalHtml) {
      button.disabled = false;
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }

  /** Rellena un <select> con opciones [{ value, label }] */
  function fillSelect(select, options, { placeholder = '', selected = '' } = {}) {
    select.innerHTML = (placeholder ? `<option value="">${escapeHTML(placeholder)}</option>` : '')
      + options.map((o) => `<option value="${escapeHTML(o.value)}" ${o.value === selected ? 'selected' : ''}>${escapeHTML(o.label)}</option>`).join('');
  }

  return {
    toast, openModal, closeModal, initModals, actionSheet, isAnyModalOpen, confirm,
    clearErrors, showErrors, liveClearErrors, validateAmount,
    emptyState, budgetLevel, progressBar, ring, sparkline, money, kpi, dateTile, categoryChip,
    categoryBadge, trendBadge, compareFoot, statusNote, choiceGroup, setLoading, fillSelect,
  };
})();
