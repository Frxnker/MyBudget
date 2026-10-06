/**
 * categories.js
 * Categorías predeterminadas y personalizadas de gastos e ingresos.
 */
const Categories = (() => {
  const { escapeHTML, $ } = Utils;

  // Paleta categórica (orden fijo): el color sigue a la categoría, no a su posición en la gráfica
  const DEFAULTS = [
    { id: 'exp-alimentacion', name: 'Alimentación', icon: '🛒', type: 'expense', color: '#2a78d6' },
    { id: 'exp-transporte', name: 'Transporte', icon: '🚌', type: 'expense', color: '#eb6834' },
    { id: 'exp-vivienda', name: 'Vivienda', icon: '🏠', type: 'expense', color: '#1baf7a' },
    { id: 'exp-ocio', name: 'Ocio', icon: '🎬', type: 'expense', color: '#eda100' },
    { id: 'exp-compras', name: 'Compras', icon: '🛍️', type: 'expense', color: '#e87ba4' },
    { id: 'exp-salud', name: 'Salud', icon: '💊', type: 'expense', color: '#008300' },
    { id: 'exp-educacion', name: 'Educación', icon: '📚', type: 'expense', color: '#4a3aa7' },
    { id: 'exp-suscripciones', name: 'Suscripciones', icon: '📺', type: 'expense', color: '#e34948' },
    { id: 'exp-viajes', name: 'Viajes', icon: '✈️', type: 'expense', color: '#184f95' },
    { id: 'exp-otros', name: 'Otros', icon: '📦', type: 'expense', color: '#8b8d98' },
    { id: 'inc-salario', name: 'Salario', icon: '💼', type: 'income', color: '#1baf7a' },
    { id: 'inc-freelance', name: 'Freelance', icon: '💻', type: 'income', color: '#2a78d6' },
    { id: 'inc-inversiones', name: 'Inversiones', icon: '📈', type: 'income', color: '#4a3aa7' },
    { id: 'inc-regalos', name: 'Regalos', icon: '🎁', type: 'income', color: '#e87ba4' },
    { id: 'inc-otros', name: 'Otros', icon: '💶', type: 'income', color: '#8b8d98' },
  ];

  const EMOJIS = ['🐶', '🎮', '☕', '🍔', '⚽', '🎵', '👶', '💡', '🔧', '🚗', '📱', '💄',
    '🎨', '🏋️', '🍷', '🧾', '🏦', '💰', '🪙', '🎓', '🌱', '🧸', '🛠️', '❤️'];

  const UNKNOWN = { id: '', name: 'Sin categoría', icon: '❔', type: 'expense', color: '#8b8d98', custom: false };

  function defaults() {
    return DEFAULTS.map((c) => ({ ...c, custom: false }));
  }

  function all() {
    return Store.get('categories') || [];
  }

  function byType(type) {
    return all().filter((c) => c.type === type);
  }

  function get(id) {
    return all().find((c) => c.id === id) || UNKNOWN;
  }

  function exists(id, type) {
    return all().some((c) => c.id === id && (!type || c.type === type));
  }

  /** Opciones para un <select> */
  function options(type) {
    return byType(type).map((c) => ({ value: c.id, label: `${c.icon}  ${c.name}` }));
  }

  /** Categoría "Otros" del tipo indicado, usada al borrar una categoría personalizada */
  function fallbackId(type) {
    return type === 'income' ? 'inc-otros' : 'exp-otros';
  }

  function save(data, id = null) {
    const list = all();
    if (id) {
      Store.set('categories', list.map((c) => (c.id === id ? { ...c, ...data } : c)));
    } else {
      Store.set('categories', [...list, { id: Utils.uid('cat'), ...data, custom: true }]);
    }
  }

  /** Elimina una categoría personalizada y reasigna sus movimientos a "Otros" */
  async function remove(id) {
    const category = get(id);
    if (!category.custom) return;
    const used = Transactions.all().filter((t) => t.categoryId === id).length;
    const ok = await UI.confirm({
      title: `Eliminar "${category.name}"`,
      message: used
        ? `Hay ${used} movimiento(s) con esta categoría. Pasarán a la categoría "Otros".`
        : 'Esta acción no se puede deshacer.',
    });
    if (!ok) return;

    const fallback = fallbackId(category.type);
    const budgets = Store.get('budgets');
    const byCategory = { ...budgets.byCategory };
    delete byCategory[id];

    Store.setMany({
      categories: all().filter((c) => c.id !== id),
      transactions: Transactions.all().map((t) => (t.categoryId === id ? { ...t, categoryId: fallback } : t)),
      recurring: Store.get('recurring').map((r) => (r.categoryId === id ? { ...r, categoryId: fallback } : r)),
      budgets: { ...budgets, byCategory },
    });
    UI.toast(`Categoría "${category.name}" eliminada`);
  }

  /* ---------- Formulario ---------- */

  let editingId = null;

  function openForm(id = null, type = 'expense') {
    const form = $('#category-form');
    form.reset();
    editingId = id;
    const category = id ? get(id) : null;
    $('#category-modal-title').textContent = category ? 'Editar categoría' : 'Nueva categoría';
    form.elements.name.value = category ? category.name : '';
    form.elements.type.value = category ? category.type : type;
    form.elements.type.disabled = Boolean(category); // no se cambia el tipo de una categoría existente
    form.elements.color.value = category ? category.color : '#5b5bd6';
    form.elements.icon.value = category ? category.icon : '';
    UI.openModal('category-modal');
  }

  function handleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const name = form.elements.name.value.trim();
    const type = form.elements.type.value;
    const icon = form.elements.icon.value.trim();
    const errors = {};

    if (!name) errors.name = 'El nombre es obligatorio.';
    else if (byType(type).some((c) => c.id !== editingId && Utils.normalize(c.name) === Utils.normalize(name))) {
      errors.name = 'Ya existe una categoría con ese nombre.';
    }
    if (!icon) errors.icon = 'Elige un icono para la categoría.';
    if (!UI.showErrors(form, errors)) return;

    save({ name, type, icon, color: form.elements.color.value }, editingId);
    UI.closeModal('category-modal');
    UI.toast(editingId ? 'Categoría actualizada' : `Categoría "${name}" creada`);
  }

  function init() {
    const picker = $('#emoji-picker');
    picker.innerHTML = EMOJIS.map((e) => `<button type="button" class="emoji-option" data-emoji="${e}">${e}</button>`).join('');
    picker.addEventListener('click', (event) => {
      const button = event.target.closest('[data-emoji]');
      if (!button) return;
      const input = $('#cat-icon');
      input.value = button.dataset.emoji;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const form = $('#category-form');
    form.addEventListener('submit', handleSubmit);
    UI.liveClearErrors(form);
  }

  /** Lista de categorías (usada en Configuración) */
  function renderList(type) {
    return byType(type).map((c) => `
      <li class="category-item">
        ${UI.categoryBadge(c, 'sm')}
        <span class="category-name">${escapeHTML(c.name)}</span>
        ${c.custom
          ? `<span class="badge">Personalizada</span>
             <button class="btn-icon btn-icon-sm" data-action="edit-category" data-id="${escapeHTML(c.id)}" aria-label="Editar ${escapeHTML(c.name)}">${Icons.get('edit', 16)}</button>
             <button class="btn-icon btn-icon-sm btn-icon-danger" data-action="delete-category" data-id="${escapeHTML(c.id)}" aria-label="Eliminar ${escapeHTML(c.name)}">${Icons.get('trash', 16)}</button>`
          : '<span class="badge badge-muted">Predeterminada</span>'}
      </li>`).join('');
  }

  return { defaults, all, byType, get, exists, options, fallbackId, openForm, remove, init, renderList };
})();
