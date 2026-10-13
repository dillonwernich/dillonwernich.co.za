import { html } from '../lib/html.js';
import { modal } from './overlay.js';
import { icon } from './icons.js';
import { state, statusById } from '../data/store.js';
import { navigate } from '../router.js';
import { NAV } from '../shell.js';
import { matches, sortBy } from '../lib/util.js';

let open = null;

function results(q) {
  const groups = [];
  const actions = [{ label: 'New quote', icon: 'plus', href: '/admin/quotes/new/' }, { label: 'New client', icon: 'plus', href: '/admin/clients/?new=1' }]
    .filter((a) => matches(a.label, q));
  if (actions.length) groups.push({ name: 'Actions', items: actions });

  const screens = NAV.filter((n) => matches(n.label, q)).map((n) => ({ label: n.label, icon: n.icon, href: n.href }));
  if (screens.length) groups.push({ name: 'Go to', items: screens });

  if (q) {
    const clients = sortBy([...state.clients.values()].filter((c) => matches(`${c.company} ${c.contactName} ${c.email}`, q)), 'company')
      .slice(0, 6)
      .map((c) => ({ label: c.company || c.contactName, sub: c.contactName, icon: 'clients', href: `/admin/clients/${c.id}/` }));
    if (clients.length) groups.push({ name: 'Clients', items: clients });

    const quotes = [...state.quotes.values()]
      .filter((x) => matches(`${x.number || ''} ${x.title} ${x.clientSnapshot?.company || ''}`, q))
      .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))
      .slice(0, 6)
      .map((x) => ({ label: x.title || 'Untitled quote', sub: [x.number, statusById(x.status)?.label].filter(Boolean).join(' · '), icon: 'quotes', href: `/admin/quotes/${x.id}/` }));
    if (quotes.length) groups.push({ name: 'Quotes', items: quotes });
  }
  return groups;
}

export function openPalette() {
  if (open) return;
  let index = 0;
  let flat = [];
  const m = modal({
    className: 'palette',
    label: 'Command palette',
    body: html`<input class="palette-input" type="search" placeholder="Search clients and quotes, or jump to a screen" aria-label="Search" autocomplete="off"><div class="palette-list" role="listbox"></div>`,
  });
  open = m;
  const input = m.node.querySelector('input');
  const list = m.node.querySelector('.palette-list');

  const draw = () => {
    const groups = results(input.value.trim());
    flat = groups.flatMap((g) => g.items);
    index = Math.min(index, Math.max(0, flat.length - 1));
    let i = 0;
    list.innerHTML = flat.length
      ? String(html`${groups.map((g) => html`<div class="palette-group eyebrow">${g.name}</div>${g.items.map((it) => html`
          <button type="button" class="palette-item" role="option" data-i="${i}" aria-selected="${i++ === index}">${icon(it.icon)}<span>${it.label}</span>${it.sub ? html`<span class="sub">${it.sub}</span>` : ''}</button>`)}`)}`)
      : String(html`<div class="palette-none">No matches.</div>`);
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };

  const go = (i) => {
    const target = flat[i];
    if (!target) return;
    close();
    navigate(target.href);
  };
  const close = () => { m.close(); open = null; };

  input.addEventListener('input', () => { index = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); index = (index + 1) % Math.max(1, flat.length); draw(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); index = (index - 1 + flat.length) % Math.max(1, flat.length); draw(); }
    if (e.key === 'Enter') { e.preventDefault(); go(index); }
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) go(Number(b.dataset.i));
  });
  new MutationObserver((_, obs) => { if (!m.node.isConnected) { open = null; obs.disconnect(); } }).observe(document.body, { childList: true });

  draw();
  setTimeout(() => input.focus(), 20);
}

export function bindPaletteKey() {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (open) { open.close(); open = null; } else openPalette();
    }
  });
}

