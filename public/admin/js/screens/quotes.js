import { html, attr } from '../lib/html.js';
import { money, date, toDate } from '../lib/format.js';
import { state, lib, statusById, roleOf } from '../data/store.js';
import { icon } from '../ui/icons.js';
import { empty, statusBadge, kebab, skeletonTable } from '../ui/blocks.js';
import { menu, confirm } from '../ui/overlay.js';
import { toast, toastError } from '../ui/toast.js';
import { navigate } from '../router.js';
import { matches } from '../lib/util.js';
import { setStatus, createRevision, duplicateQuote, deleteQuote } from './quote-lifecycle.js';

const SORTS = {
  updated: { label: 'Updated', get: (q) => toDate(q.updatedAt)?.getTime() || 0, dir: -1 },
  number: { label: 'Number', get: (q) => q.number || '', dir: -1 },
  total: { label: 'Total', get: (q) => q.totals?.total || 0, dir: -1 },
  valid: { label: 'Valid until', get: (q) => toDate(q.validUntil)?.getTime() || 0, dir: 1 },
};

export default function quotes(view) {
  const ui = { q: '', status: view.params.query.role ? `role:${view.params.query.role}` : '', sort: 'updated', dir: -1, showSuperseded: false };

  view.header({
    title: 'Quotes',
    actions: html`<a class="btn btn-primary" href="/admin/quotes/new/">${icon('plus')}New quote</a>`,
  });

  view.el.innerHTML = String(html`
    <div class="toolbar">
      <input class="input" type="search" placeholder="Search number, title or client" data-q aria-label="Search quotes">
      <select class="select" data-status aria-label="Status"></select>
      <label class="check"><input type="checkbox" data-superseded> <span>Show superseded</span></label>
    </div>
    <div data-list>${skeletonTable(5)}</div>`);

  const list = view.el.querySelector('[data-list]');
  const statusSel = view.el.querySelector('[data-status]');

  const drawStatusFilter = () => {
    statusSel.innerHTML = String(html`<option value="">All statuses</option>${lib('statuses', { all: true }).map((s) => html`<option value="${s.id}"${attr(ui.status === s.id || ui.status === `role:${s.role}`, 'selected')}>${s.label}</option>`)}`);
  };

  const draw = () => {
    if (!state.loaded.has('quotes')) return;
    let rows = [...state.quotes.values()];
    if (ui.status.startsWith('role:')) rows = rows.filter((q) => roleOf(q) === ui.status.slice(5));
    else if (ui.status) rows = rows.filter((q) => q.status === ui.status);
    if (!ui.showSuperseded && !ui.status) rows = rows.filter((q) => roleOf(q) !== 'superseded');
    if (ui.q) rows = rows.filter((q) => matches(`${q.number || ''} ${q.title} ${q.clientSnapshot?.company || ''} ${q.clientSnapshot?.contactName || ''}`, ui.q));
    const s = SORTS[ui.sort];
    rows.sort((a, b) => {
      const x = s.get(a);
      const y = s.get(b);
      return (x > y ? 1 : x < y ? -1 : 0) * ui.dir;
    });

    if (!state.quotes.size) {
      list.innerHTML = String(html`<div class="panel">${empty('No quotes yet.', { label: 'New quote', action: 'new', icon: 'plus' })}</div>`);
      return;
    }
    if (!rows.length) {
      list.innerHTML = String(html`<div class="panel">${empty('No quotes match these filters.', { label: 'Clear filters', action: 'clear' })}</div>`);
      return;
    }

    const th = (key, label, cls = '') => html`<th class="${cls}"><button type="button" data-sort="${key}">${label}${ui.sort === key ? icon(ui.dir > 0 ? 'arrowUp' : 'arrowDown') : ''}</button></th>`;
    list.innerHTML = String(html`
      <div class="table-wrap"><table class="table">
        <thead><tr>
          ${th('number', 'Number', 'col-opt')}<th>Quote</th><th class="col-opt">Status</th>
          ${th('valid', 'Valid until', 'col-opt')}${th('total', 'Total', 'num')}${th('updated', 'Updated', 'col-opt num')}<th></th>
        </tr></thead>
        <tbody>${rows.map((q) => html`
          <tr class="link" data-href="/admin/quotes/${q.id}/">
            <td class="col-opt mono">${q.number || html`<span class="faint">—</span>`}</td>
            <td><div class="primary">${q.title || 'Untitled quote'}</div><div class="sub">${q.clientSnapshot?.company || q.clientSnapshot?.contactName || 'No client'}</div></td>
            <td class="col-opt">${statusBadge(statusById(q.status))}</td>
            <td class="col-opt num">${date(q.validUntil)}</td>
            <td class="num">${money(q.totals?.total)}${q.totals?.monthly ? html`<div class="sub">+ ${money(q.totals.monthly)} pm</div>` : ''}</td>
            <td class="col-opt num faint">${date(q.updatedAt)}</td>
            <td class="actions">${kebab('menu', q.id)}</td>
          </tr>`)}</tbody>
      </table></div>`);
  };

  const rowMenu = (anchor, q) => {
    const statuses = lib('statuses').filter((s) => s.id !== q.status && s.role !== 'superseded');
    menu(anchor, [
      { label: 'Open', icon: 'edit', onSelect: () => navigate(`/admin/quotes/${q.id}/`) },
      { label: 'Print or PDF', icon: 'printer', onSelect: () => navigate(`/admin/quotes/${q.id}/print/`) },
      'sep',
      ...statuses.map((s) => ({
        label: `Mark ${s.label.toLowerCase()}`,
        onSelect: async () => {
          try {
            const undo = await setStatus(q, s.id);
            toast(`Marked ${s.label.toLowerCase()}.`, { undo });
          } catch (e) { toastError(e); }
        },
      })),
      'sep',
      ...(q.number ? [{
        label: 'Create revision', icon: 'copy',
        onSelect: async () => {
          try { const id = await createRevision(q); toast('Revision created.'); navigate(`/admin/quotes/${id}/`); } catch (e) { toastError(e); }
        },
      }] : []),
      {
        label: 'Duplicate', icon: 'copy',
        onSelect: async () => {
          try { const id = await duplicateQuote(q); toast('Quote duplicated.'); navigate(`/admin/quotes/${id}/`); } catch (e) { toastError(e); }
        },
      },
      {
        label: 'Delete', icon: 'trash', danger: true,
        onSelect: async () => {
          if (q.number && !(await confirm({ title: `Delete ${q.number}?`, body: 'The quote number will not be reused.', confirmLabel: 'Delete', danger: true }))) return;
          try { const undo = await deleteQuote(q); toast('Quote deleted.', { undo }); } catch (e) { toastError(e); }
        },
      },
    ]);
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
    const act = e.target.closest('[data-action]');
    if (act?.dataset.action === 'menu') { e.stopPropagation(); rowMenu(act, state.quotes.get(act.dataset.id)); return; }
    if (act?.dataset.action === 'new') { navigate('/admin/quotes/new/'); return; }
    if (act?.dataset.action === 'clear') {
      ui.q = ''; ui.status = '';
      view.el.querySelector('[data-q]').value = '';
      drawStatusFilter();
      draw();
      return;
    }
    const row = e.target.closest('tr[data-href]');
    if (row) navigate(row.dataset.href);
  });
  view.el.querySelector('[data-q]').addEventListener('input', (e) => { ui.q = e.target.value.trim(); draw(); });
  statusSel.addEventListener('change', (e) => { ui.status = e.target.value; draw(); });
  view.el.querySelector('[data-superseded]').addEventListener('change', (e) => { ui.showSuperseded = e.target.checked; draw(); });

  drawStatusFilter();
  draw();
  view.watch(['quotes'], draw);
  view.watch(['libraries.statuses'], () => { drawStatusFilter(); draw(); });
}
