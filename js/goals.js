/**
 * goals.js
 * Objetivos de ahorro: crear, editar, eliminar y registrar aportaciones.
 */
const Goals = (() => {
  const { $, escapeHTML, formatMoney, formatPercent, percent, formatDate } = Utils;

  function all() {
    return Store.get('goals') || [];
  }

  function get(id) {
    return all().find((g) => g.id === id);
  }

  function save(data, id = null) {
    if (id) {
      Store.set('goals', all().map((g) => (g.id === id ? { ...g, ...data, demo: undefined } : g)));
    } else {
      Store.set('goals', [...all(), { id: Utils.uid('goal'), ...data, createdAt: Date.now() }]);
    }
  }

  async function remove(id) {
    const goal = get(id);
    const ok = await UI.confirm({
      title: 'Eliminar objetivo',
      message: `Se eliminará el objetivo "${goal.name}" y su progreso (${formatMoney(goal.saved)} ahorrados).`,
    });
    if (!ok) return;
    Store.set('goals', all().filter((g) => g.id !== id));
    UI.toast(`Objetivo "${goal.name}" eliminado`, 'info');
  }

  /** Progreso y cuánto hay que ahorrar al mes para llegar a tiempo */
  function progress(goal) {
    const pct = percent(goal.saved, goal.target);
    const remaining = Math.max(goal.target - goal.saved, 0);
    let monthlyNeeded = null;
    let monthsLeft = null;
    if (goal.deadline && remaining > 0) {
      monthsLeft = Utils.monthDiff(Utils.currentMonthKey(), Utils.monthKey(goal.deadline));
      monthlyNeeded = monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : remaining;
    }
    return { pct, remaining, completed: goal.saved >= goal.target, monthsLeft, monthlyNeeded };
  }

  /* ---------------------------------------------------------------
   * FORMULARIOS
   * ------------------------------------------------------------- */

  let editingId = null;
  let contributionId = null;

  function openForm(id = null) {
    const form = $('#goal-form');
    form.reset();
    editingId = id;
    const goal = id ? get(id) : null;
    form.elements.name.value = goal?.name || '';
    form.elements.target.value = goal ? Utils.centsToInput(goal.target) : '';
    form.elements.saved.value = goal ? Utils.centsToInput(goal.saved) : '';
    form.elements.deadline.value = goal?.deadline || '';
    form.elements.icon.value = goal?.icon || '';
    $('#goal-modal-title').textContent = goal ? 'Editar objetivo' : 'Nuevo objetivo';
    UI.openModal('goal-modal');
  }

  function handleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const name = form.elements.name.value.trim();
    const deadline = form.elements.deadline.value;
    const errors = {};

    if (!name) errors.name = 'El nombre es obligatorio.';
    const target = UI.validateAmount(form.elements.target.value, { label: 'El objetivo' });
    if (target.error) errors.target = target.error;
    const saved = UI.validateAmount(form.elements.saved.value, { required: false, allowZero: true, label: 'La cantidad ahorrada' });
    if (saved.error) errors.saved = saved.error;
    if (deadline && !Utils.isValidISODate(deadline)) errors.deadline = 'La fecha no es válida.';
    else if (deadline && deadline < Utils.todayISO() && !editingId) errors.deadline = 'La fecha límite no puede estar en el pasado.';
    if (!UI.showErrors(form, errors)) return;

    save({
      name,
      target: target.cents,
      saved: saved.cents,
      deadline,
      icon: form.elements.icon.value.trim() || '🎯',
    }, editingId);
    UI.closeModal('goal-modal');
    UI.toast(editingId ? 'Objetivo actualizado' : `Objetivo "${name}" creado`);
  }

  function openContribution(id) {
    const form = $('#contribution-form');
    form.reset();
    contributionId = id;
    const goal = get(id);
    $('#contribution-goal-name').textContent = `${goal.icon} ${goal.name} · ${formatMoney(goal.saved)} de ${formatMoney(goal.target)}`;
    UI.openModal('contribution-modal');
  }

  function handleContribution(event) {
    event.preventDefault();
    const form = event.target;
    const goal = get(contributionId);
    const operation = form.elements.operation.value;
    const amount = UI.validateAmount(form.elements.amount.value);
    const errors = {};
    if (amount.error) errors.amount = amount.error;
    else if (operation === 'withdraw' && amount.cents > goal.saved) {
      errors.amount = `No puedes retirar más de lo ahorrado (${formatMoney(goal.saved)}).`;
    }
    if (!UI.showErrors(form, errors)) return;

    const newSaved = operation === 'add' ? goal.saved + amount.cents : goal.saved - amount.cents;
    save({ saved: newSaved }, goal.id);
    UI.closeModal('contribution-modal');

    if (operation === 'add' && newSaved >= goal.target && goal.saved < goal.target) {
      UI.toast(`🎉 ¡Has alcanzado el objetivo "${goal.name}"!`, 'success', 5000);
    } else {
      UI.toast(operation === 'add' ? `${formatMoney(amount.cents)} añadidos a "${goal.name}"` : `${formatMoney(amount.cents)} retirados de "${goal.name}"`);
    }
  }

  /* ---------------------------------------------------------------
   * VISTA
   * ------------------------------------------------------------- */

  /** Versión compacta (usada en el dashboard) */
  function miniHTML(goal) {
    const p = progress(goal);
    return `
      <li class="goal-mini">
        <span class="goal-mini-icon" aria-hidden="true">${escapeHTML(goal.icon)}</span>
        <div class="grow">
          <div class="goal-mini-top">
            <strong>${escapeHTML(goal.name)}</strong>
            <span>${formatPercent(p.pct)}</span>
          </div>
          ${UI.progressBar(p.pct, 'goal', `Progreso de ${goal.name}`)}
          <small class="muted">${formatMoney(goal.saved)} de ${formatMoney(goal.target)}</small>
        </div>
      </li>`;
  }

  function cardHTML(goal) {
    const p = progress(goal);
    const id = escapeHTML(goal.id);
    const name = escapeHTML(goal.name);
    let deadlineText = '';
    if (goal.deadline) {
      deadlineText = p.completed
        ? `Fecha límite: ${formatDate(goal.deadline)}`
        : goal.deadline < Utils.todayISO()
          ? `<span class="text-danger">La fecha límite (${formatDate(goal.deadline)}) ya ha pasado</span>`
          : `Ahorra <strong>${formatMoney(p.monthlyNeeded)}/mes</strong> para llegar antes del ${formatDate(goal.deadline)}`;
    }
    return `
      <article class="card goal-card ${p.completed ? 'is-complete' : ''}">
        <header class="goal-header">
          <span class="goal-icon" aria-hidden="true">${escapeHTML(goal.icon)}</span>
          <div class="grow">
            <h3>${name}</h3>
            ${p.completed ? '<span class="pill pill-income">🎉 Completado</span>' : `<span class="muted">Faltan ${formatMoney(p.remaining)}</span>`}
          </div>
          <div class="card-actions">
            <button class="btn-icon btn-icon-sm" data-action="edit-goal" data-id="${id}" aria-label="Editar ${name}">${Icons.get('edit', 16)}</button>
            <button class="btn-icon btn-icon-sm btn-icon-danger" data-action="delete-goal" data-id="${id}" aria-label="Eliminar ${name}">${Icons.get('trash', 16)}</button>
          </div>
        </header>
        <div class="goal-progress">
          <div class="goal-ring">
            ${UI.ring(p.pct, { size: 92, stroke: 9, label: `Progreso de ${goal.name}: ${formatPercent(p.pct)}` })}
            <strong class="goal-ring-label">${formatPercent(p.pct)}</strong>
          </div>
          <dl class="goal-figures">
            <div><dt>Ahorrado</dt><dd>${UI.money(goal.saved)}</dd></div>
            <div><dt>Objetivo</dt><dd>${formatMoney(goal.target)}</dd></div>
          </dl>
        </div>
        ${deadlineText ? `<p class="goal-deadline">${Icons.get('calendar', 16)}<span>${deadlineText}</span></p>` : ''}
        <button class="btn btn-ghost btn-block" data-action="contribute-goal" data-id="${id}">${Icons.get('coins', 16)}Actualizar ahorro</button>
      </article>`;
  }

  function render() {
    const view = $('#view-objetivos');
    const goals = all();
    if (!goals.length) {
      view.innerHTML = `<div class="card">${UI.emptyState({
        icon: 'target', title: 'Aún no tienes objetivos',
        text: 'Crea un objetivo de ahorro (un viaje, un fondo de emergencia…) y sigue tu progreso.',
        action: '<button class="btn btn-primary" data-action="add-goal">Crear objetivo</button>',
      })}</div>`;
      return;
    }
    const totalSaved = Utils.sumBy(goals, (g) => g.saved);
    const totalTarget = Utils.sumBy(goals, (g) => g.target);
    const globalPct = percent(totalSaved, totalTarget);
    const completed = goals.filter((g) => g.saved >= g.target).length;

    // Primero los pendientes con más progreso; los completados al final
    const sorted = goals
      .map((goal) => ({ goal, p: progress(goal) }))
      .sort((a, b) => a.p.completed - b.p.completed || b.p.pct - a.p.pct)
      .map((x) => x.goal);

    view.innerHTML = `
      <div class="kpi-grid kpi-grid-3">
        ${UI.kpi({ label: 'Total ahorrado', value: UI.money(totalSaved), icon: 'coins', tone: 'savings', foot: `<span class="muted">de ${formatMoney(totalTarget)}</span>` })}
        ${UI.kpi({ label: 'Progreso global', value: formatPercent(globalPct), icon: 'target', foot: UI.progressBar(globalPct, 'goal', 'Progreso global') })}
        ${UI.kpi({ label: 'Completados', value: `${completed}<span class="kpi-value-minor"> / ${goals.length}</span>`, icon: 'check', tone: 'income', foot: '<span class="muted">objetivos alcanzados</span>' })}
      </div>
      <div class="section-header">
        <h2>Tus objetivos</h2>
        <button class="btn btn-primary" data-action="add-goal">${Icons.get('plus', 18)}Nuevo objetivo</button>
      </div>
      <div class="goal-grid">${sorted.map(cardHTML).join('')}</div>`;
  }

  const actions = {
    'add-goal': () => openForm(),
    'edit-goal': (id) => openForm(id),
    'delete-goal': (id) => remove(id),
    'contribute-goal': (id) => openContribution(id),
  };

  function init() {
    const form = $('#goal-form');
    form.addEventListener('submit', handleSubmit);
    UI.liveClearErrors(form);
    const contribution = $('#contribution-form');
    contribution.addEventListener('submit', handleContribution);
    UI.liveClearErrors(contribution);
  }

  return { all, progress, miniHTML, render, actions, init };
})();
