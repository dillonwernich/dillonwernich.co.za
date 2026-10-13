import { html, attr } from '../lib/html.js';
import { money, date, toDate } from '../lib/format.js';
import { state, lib } from '../data/store.js';
import { icon } from '../ui/icons.js';
import { empty, skeletonTable } from '../ui/blocks.js';
import { navigate } from '../router.js';
import { matches } from '../lib/util.js';
import { clientDrawer, clientName, tagLabel } from './client-form.js';

const SORTS = {
  name: { get: (c) => clientName(c).toLowerCase(), dir: 1 },
  updated: { get: (c) => toDate(c.updatedAt)?.getTime() || 0, dir: -1 },
  quotes: { get: (c) => c._quotes, dir: -1 },
  value: { get: (c) => c._value, dir: -1 },
};

export default function clients(view) {
  const ui = { q: '', tag: '', sort: 'name', dir: 1 };

  view.header({
    title: 'Clients',
    actions: html`<button type="button" class="btn btn-primary" data-new>${icon('plus')}New client</button>`,
  });
  const headerNew = document.querySelector('[data-actions] [data-new]');
  const openNew = () => clientDrawer(null, { onSaved: (id) => navigate(`/admin/clients/${id}/`) });
  headerNew.addEventListener('click', openNew);

  view.el.innerHTML = String(html`
    <div class="toolbar">
      <input class="input" type="search" placeholder="Search company, contact or email" data-q aria-label="Search clients">
      <select class="select" data-tag aria-label="Tag"></select>
    </div>
    <div data-list>${skeletonTable(5)}</div>`);
  const list = view.el.querySelector('[data-list]');
  const tagSel = view.el.querySelector('[data-tag]');

  const drawTags = () => {
    tagSel.innerHTML = String(html`<option value="">All tags</option>${lib('tags', { all: true }).map((t) => html`<option value="${t.id}"${attr(ui.tag === t.id, 'selected')}>${t.label}</option>`)}`);
  };

  const draw = () => {
    if (!state.loaded.has('clients')) return;
    const quotes = [...state.quotes.values()];
    let rows = [...state.clients.values()].filter((c) => !c.mergedInto).map((c) => {
      const mine = quotes.filter((q) => q.clientId === c.id);
      return { ...c, _quotes: mine.length, _value: mine.filter((q) => q.acceptedAt).reduce((n, q) => n + (q.totals?.total || 0), 0) };
    });
    const total = rows.length;
    if (ui.tag) rows = rows.filter((c) => (c.tags || []).includes(ui.tag));
    if (ui.q) rows = rows.filter((c) => matches(`${c.company} ${c.contactName} ${c.email} ${c.phone}`, ui.q));
    const s = SORTS[ui.sort];
    rows.sort((a, b) => {
      const x = s.get(a);
      const y = s.get(b);
      return (x > y ? 1 : x < y ? -1 : 0) * ui.dir;
    });

    if (!total) {
      list.innerHTML = String(html`<div class="panel">${empty('No clients yet.', { label: 'New client', action: 'new', icon: 'plus' })}</div>`);
      return;
    }
    if (!rows.length) {
      list.innerHTML = String(html`<div class="panel">${empty('No clients match these filters.', { label: 'Clear filters', action: 'clear' })}</div>`);
      return;
    }
    const th = (key, label, cls = '') => html`<th class="${cls}"><button type="button" data-sort="${key}">${label}${ui.sort === key ? icon(ui.dir > 0 ? 'arrowUp' : 'arrowDown') : ''}</button></th>`;
    list.innerHTML = String(html`<div class="table-wrap"><table class="table">
      <thead><tr>${th('name', 'Client')}<th class="col-opt">Email</th><th class="col-opt">Tags</th>${th('quotes', 'Quotes', 'num col-opt')}${th('value', 'Accepted', 'num')}${th('updated', 'Updated', 'num col-opt')}</tr></thead>
      <tbody>${rows.map((c) => html`<tr class="link" data-href="/admin/clients/${c.id}/">
        <td><div class="primary">${clientName(c)}</div>${c.company && c.contactName ? html`<div class="sub">${c.contactName}</div>` : ''}</td>
        <td class="col-opt">${c.email}</td>
        <td class="col-opt">${(c.tags || []).map((t) => tagLabel(t)).filter(Boolean).map((t) => html`<span class="tag">${t}</span>`)}</td>
        <td class="num col-opt">${c._quotes}</td>
        <td class="num">${c._value ? money(c._value) : html`<span class="faint">—</span>`}</td>
        <td class="num col-opt faint">${date(c.updatedAt)}</td>
      </tr>`)}</tbody></table></div>`);
  };

  view.el.addEventListener('click', (e) => {
    const sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) {
      const key = sortBtn.dataset.sort;
      ui.dir = ui.sort === key ? -ui.dir : SORTS[key].dir;
      ui.sort = key;
      draw();
      return;
    }
    const act = e.target.closest('[data-action]')?.dataset.action;
    if (act === 'new') { openNew(); return; }
    if (act === 'clear') { ui.q = ''; ui.tag = ''; view.el.querySelector('[data-q]').value = ''; drawTags(); draw(); return; }
    const row = e.target.closest('tr[data-href]');
    if (row) navigate(row.dataset.href);
  });
  view.el.querySelector('[data-q]').addEventListener('input', (e) => { ui.q = e.target.value.trim(); draw(); });
  tagSel.addEventListener('change', (e) => { ui.tag = e.target.value; draw(); });

  drawTags();
  draw();
  view.watch(['clients', 'quotes'], draw);
  view.watch(['libraries.tags'], () => { drawTags(); draw(); });

  if (view.params.query.new) {
    history.replaceState({}, '', '/admin/clients/');
    openNew();
  }
}
