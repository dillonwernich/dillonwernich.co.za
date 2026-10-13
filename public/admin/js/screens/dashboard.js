import { html } from '../lib/html.js';
import { money, date, relative, toDate } from '../lib/format.js';
import { state, lib, statusById, roleOf } from '../data/store.js';
import { icon } from '../ui/icons.js';
import { statusBadge } from '../ui/blocks.js';
import { navigate } from '../router.js';

const ROLES = ['draft', 'sent', 'accepted', 'declined', 'expired'];

const secs = (v) => toDate(v)?.getTime() || 0;

export default function dashboard(view) {
  view.header({
    title: 'Dashboard',
    actions: html`<a class="btn btn-primary" href="/admin/quotes/new/">${icon('plus')}New quote</a>`,
  });

  const draw = () => {
    const quotes = [...state.quotes.values()];
    const statuses = lib('statuses', { all: true });
    const counts = Object.fromEntries(ROLES.map((r) => [r, quotes.filter((q) => roleOf(q) === r).length]));
    const labelFor = (role) => statuses.find((s) => s.role === role)?.label || role;

    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const inMonth = (v) => secs(v) >= start.getTime();
    const sentValue = quotes.filter((q) => inMonth(q.sentAt)).reduce((n, q) => n + (q.totals?.total || 0), 0);
    const acceptedValue = quotes.filter((q) => inMonth(q.acceptedAt)).reduce((n, q) => n + (q.totals?.total || 0), 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const week = today.getTime() + 8 * 86400000;
    const expiring = quotes
      .filter((q) => roleOf(q) === 'sent' && secs(q.validUntil) >= today.getTime() && secs(q.validUntil) < week)
      .sort((a, b) => secs(a.validUntil) - secs(b.validUntil));

    const recentQuotes = [...quotes].sort((a, b) => secs(b.updatedAt) - secs(a.updatedAt)).slice(0, 5);
    const recentClients = [...state.clients.values()].filter((c) => !c.mergedInto).sort((a, b) => secs(b.updatedAt) - secs(a.updatedAt)).slice(0, 5);

    const quoteRow = (q, extra) => html`<tr class="link" data-href="/admin/quotes/${q.id}/">
      <td><div class="primary">${q.title || 'Untitled quote'}</div><div class="sub">${[q.number, q.clientSnapshot?.company].filter(Boolean).join(' · ')}</div></td>
      <td class="col-opt">${statusBadge(statusById(q.status))}</td>
      <td class="num">${extra ?? money(q.totals?.total)}</td></tr>`;

    view.el.innerHTML = String(html`
      <div class="stack">
        <div class="stats">
          ${ROLES.map((r) => html`<a class="stat" href="/admin/quotes/?role=${r}"><div class="n">${counts[r]}</div><div class="l">${labelFor(r)}</div></a>`)}
        </div>
        <div class="stats two">
          <div class="stat"><div class="n num">${money(sentValue, { decimals: false })}</div><div class="l">Sent this month</div></div>
          <div class="stat"><div class="n num">${money(acceptedValue, { decimals: false })}</div><div class="l">Accepted this month</div></div>
        </div>

        <div class="dash-grid">
          <section class="panel">
            <div class="panel-head"><h2>Expiring in the next 7 days</h2></div>
            ${expiring.length
              ? html`<table class="table"><tbody>${expiring.map((q) => quoteRow(q, date(q.validUntil)))}</tbody></table>`
              : html`<div class="panel-body muted">Nothing expires this week.</div>`}
          </section>
          <section class="panel">
            <div class="panel-head"><h2>Recent quotes</h2><div class="btn-row"><a class="btn btn-ghost btn-sm" href="/admin/quotes/">All quotes</a></div></div>
            ${recentQuotes.length
              ? html`<table class="table"><tbody>${recentQuotes.map((q) => quoteRow(q))}</tbody></table>`
              : html`<div class="panel-body muted">No quotes yet.</div>`}
          </section>
          <section class="panel">
            <div class="panel-head"><h2>Recent clients</h2><div class="btn-row"><a class="btn btn-ghost btn-sm" href="/admin/clients/">All clients</a></div></div>
            ${recentClients.length
              ? html`<table class="table"><tbody>${recentClients.map((c) => html`<tr class="link" data-href="/admin/clients/${c.id}/">
                  <td><div class="primary">${c.company || c.contactName}</div><div class="sub">${c.contactName}</div></td>
                  <td class="num faint">${relative(c.updatedAt)}</td></tr>`)}</tbody></table>`
              : html`<div class="panel-body muted">No clients yet.</div>`}
          </section>
        </div>
      </div>`);
  };

  view.el.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-href]');
    if (row) navigate(row.dataset.href);
  });
  draw();
  view.watch(['quotes', 'clients', 'libraries.statuses'], draw);
}
