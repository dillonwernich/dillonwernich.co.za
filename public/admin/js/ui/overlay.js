import { html, el } from '../lib/html.js';
import { icon } from './icons.js';

const stack = [];

// Called on every route change so nothing from the previous screen stays on top.
export function closeAll() {
  [...stack].reverse().forEach((entry) => entry.close());
  document.querySelectorAll('.menu').forEach((m) => m.remove());
}

function trapFocus(node, e) {
  const focusable = [...node.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')]
    .filter((x) => x.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

document.addEventListener('keydown', (e) => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') { e.preventDefault(); top.requestClose(); }
  if (e.key === 'Tab') trapFocus(top.node, e);
});

function open(node, { onRequestClose } = {}) {
  const scrim = el('<div class="scrim"></div>');
  const returnFocus = document.activeElement;
  document.body.append(scrim, node);
  requestAnimationFrame(() => {
    scrim.classList.add('open');
    node.classList.add('open');
  });

  const entry = {
    node,
    requestClose: () => (onRequestClose ? onRequestClose() : entry.close()),
    close() {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      scrim.classList.remove('open');
      node.classList.remove('open');
      setTimeout(() => { scrim.remove(); node.remove(); }, 200);
      if (returnFocus && returnFocus.isConnected) returnFocus.focus();
    },
  };
  scrim.addEventListener('click', () => entry.requestClose());
  stack.push(entry);
  return entry;
}

// A side drawer for inline editing. `body` is markup; `onSubmit(form)` returns
// false to keep the drawer open (e.g. validation failed).
export function drawer({ title, body, submitLabel = 'Save', onSubmit, onOpen, extraFoot = '', guard = true }) {
  const node = el(html`
    <form class="drawer" role="dialog" aria-modal="true" aria-label="${title}" novalidate>
      <div class="drawer-head">
        <h2>${title}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
      </div>
      <div class="drawer-body">${body}</div>
      <div class="drawer-foot">
        ${extraFoot}
        <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        ${onSubmit ? html`<button type="submit" class="btn btn-primary">${submitLabel}</button>` : ''}
      </div>
    </form>`);

  let dirty = false;
  node.addEventListener('input', () => { dirty = true; });
  node.addEventListener('change', () => { dirty = true; });

  const entry = open(node, {
    onRequestClose: async () => {
      if (guard && dirty && !(await confirm({ title: 'Discard changes?', body: 'The changes in this panel have not been saved.', confirmLabel: 'Discard', danger: true }))) return;
      entry.close();
    },
  });

  node.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => entry.requestClose()));
  node.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = node.querySelector('[type="submit"]');
    submit && (submit.disabled = true);
    try {
      const result = await onSubmit?.(node);
      if (result !== false) entry.close();
    } finally {
      submit && (submit.disabled = false);
    }
  });

  onOpen?.(node, entry);
  setTimeout(() => node.querySelector('input:not([type="hidden"]),select,textarea')?.focus(), 60);
  return { node, close: () => entry.close(), markClean: () => { dirty = false; } };
}

export function modal({ body, foot, wide = false, label = 'Dialog', className = '' }) {
  const node = el(html`<div class="modal${wide ? ' wide' : ''} ${className}" role="dialog" aria-modal="true" aria-label="${label}">
    ${body}${foot ? html`<div class="modal-foot">${foot}</div>` : ''}</div>`);
  const entry = open(node);
  return { node, close: () => entry.close() };
}

export function confirm({ title, body = '', confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      label: title,
      body: html`<div class="modal-body"><h2>${title}</h2>${body ? html`<p>${body}</p>` : ''}</div>`,
      foot: html`<button type="button" class="btn btn-ghost" data-no>Cancel</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${confirmLabel}</button>`,
    });
    const finish = (v) => { if (!done) { done = true; m.close(); resolve(v); } };
    m.node.querySelector('[data-yes]').addEventListener('click', () => finish(true));
    m.node.querySelector('[data-no]').addEventListener('click', () => finish(false));
    const observer = new MutationObserver(() => { if (!m.node.isConnected) { observer.disconnect(); finish(false); } });
    observer.observe(document.body, { childList: true });
    setTimeout(() => m.node.querySelector('[data-yes]').focus(), 30);
  });
}

// Small anchored menu. items: [{ label, icon, onSelect, danger }] or 'sep'.
export function menu(anchor, items) {
  const node = el(html`<div class="menu" role="menu">${items.map((it, i) => (it === 'sep'
    ? html`<hr>`
    : html`<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.icon ? icon(it.icon) : ''}${it.label}</button>`))}</div>`);
  document.body.append(node);
  const r = anchor.getBoundingClientRect();
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  node.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
  node.style.top = `${r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
  requestAnimationFrame(() => node.classList.add('open'));

  const close = () => {
    node.remove();
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', key, true);
  };
  const outside = (e) => { if (!node.contains(e.target)) close(); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); anchor.focus(); } };
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
  });
  node.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    close();
    items[Number(b.dataset.i)].onSelect?.();
  });
  node.querySelector('button')?.focus();
}
