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

  function toast(message, type = 'success', duration = 3200) {
    const container = $('#toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `
      <span class="toast-icon">${Icons.get(TOAST_ICONS[type] || 'info', 18)}</span>
      <span class="toast-message">${escapeHTML(message)}</span>
      <button class="toast-close" aria-label="Cerrar notificación">${Icons.get('x', 16)}</button>`;
    container.appendChild(el);

    const remove = () => {
      el.classList.add('is-leaving');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    };
    el.querySelector('.toast-close').addEventListener('click', remove);
    setTimeout(remove, duration);
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

  /** Valida una cantidad en euros. Devuelve { cents } o { error } */
  function validateAmount(raw, { required = true, allowZero = false, label = 'La cantidad' } = {}) {
    if (raw === '' || raw === null || raw === undefined) {
      return required ? { error: `${label} es obligatoria.` } : { cents: 0 };
    }
    const cents = Utils.toCents(raw);
    if (Number.isNaN(cents)) return { error: `${label} no es un número válido.` };
    if (allowZero ? cents < 0 : cents <= 0) {
      return { error: allowZero ? `${label} no puede ser negativa.` : `${label} debe ser mayor que 0.` };
    }
    if (cents > 99999999999) return { error: `${label} es demasiado grande.` };
    return { cents };
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
   * Barra de progreso. "level" puede ser ok | warn | over | goal
   */
  function progressBar(pct, level = 'ok', label = '') {
    const width = Utils.clamp(pct, 0, 100);
    return `
      <div class="progress progress-${level}" role="progressbar" aria-valuemin="0" aria-valuemax="100"
           aria-valuenow="${Math.round(pct)}" ${label ? `aria-label="${escapeHTML(label)}"` : ''}>
        <div class="progress-bar" style="--progress:${width}%"></div>
      </div>`;
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
    return `<span class="trend ${good ? 'trend-good' : 'trend-bad'}">
      ${Icons.get(up ? 'trendUp' : 'trendDown', 14)}
      ${up ? '+' : ''}${Utils.formatPercent(change)} <span class="muted">vs. mes anterior</span>
    </span>`;
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
    toast, openModal, closeModal, initModals, isAnyModalOpen, confirm,
    clearErrors, showErrors, liveClearErrors, validateAmount,
    emptyState, budgetLevel, progressBar, categoryBadge, trendBadge, setLoading, fillSelect,
  };
})();
