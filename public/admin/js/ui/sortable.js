// Pointer-based reordering so it works with touch as well as a mouse.
// Items are the container's direct children matching itemSelector, so sortables can
// nest (items inside sections). Dragging starts only from a [data-handle].
export function sortable(container, { itemSelector = '[data-sort-id]', onReorder }) {
  let drag = null;

  const items = () => [...container.children].filter((n) => n.matches(itemSelector));

  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('[data-handle]');
    if (!handle || !container.contains(handle)) return;
    const item = handle.closest(itemSelector);
    if (!item || item.parentElement !== container) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    drag = { item, handle, target: null, after: false };
    item.classList.add('dragging');
  });

  const locate = (e) => {
    const list = items();
    let target = null;
    let after = false;
    for (const n of list) {
      const r = n.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom) {
        target = n;
        after = e.clientY > r.top + r.height / 2;
        break;
      }
    }
    list.forEach((n) => n.classList.remove('drop-before', 'drop-after'));
    if (target && target !== drag.item) target.classList.add(after ? 'drop-after' : 'drop-before');
    drag.target = target;
    drag.after = after;
  };

  container.addEventListener('pointermove', (e) => { if (drag) locate(e); });

  const end = (e) => {
    if (!drag) return;
    if (e.type === 'pointerup') {
      // Releasing past the list keeps the last row the pointer was over.
      const { target: lastTarget, after: lastAfter } = drag;
      locate(e);
      if (!drag.target) Object.assign(drag, { target: lastTarget, after: lastAfter });
    }
    const list = items();
    list.forEach((n) => n.classList.remove('drop-before', 'drop-after', 'dragging'));
    const { item, target, after } = drag;
    drag = null;
    if (!target || target === item) return;
    const ids = list.map((n) => n.dataset.sortId);
    const from = ids.indexOf(item.dataset.sortId);
    let to = ids.indexOf(target.dataset.sortId) + (after ? 1 : 0);
    if (from < to) to -= 1;
    if (from !== to) onReorder(item.dataset.sortId, to, from);
  };
  container.addEventListener('pointerup', end);
  container.addEventListener('pointercancel', end);
}
