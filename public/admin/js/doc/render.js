import { html } from '../lib/html.js';
import { money, date, percent } from '../lib/format.js';
import { milestoneAmounts } from '../pricing/engine.js';

// Renders the client-facing quote. Pure markup from data, so the same output serves the
// print route, the saved HTML snapshot and a future share link.

const nonEmpty = (v) => (Array.isArray(v) ? v.filter((x) => String(x || '').trim()) : []);

function groupLines(lines) {
  const groups = [];
  for (const l of lines) {
    let g = groups.find((x) => x.id === l.sectionId);
    if (!g) groups.push((g = { id: l.sectionId, name: l.sectionName, lines: [] }));
    g.lines.push(l);
  }
  return groups;
}

function amountCell(l, suffix = '') {
  if (l.kind === 'multiplier') return '';
  if (!l.amount) return 'Included';
  return `${money(l.amount)}${suffix}`;
}

// A choice item named like its section ("Project type" under "Project type") prints
// just the chosen option, so the heading is not repeated.
function lineBody(l, groupName = '') {
  const desc = l.clientDescription || '';
  const chosen = ['single-select', 'complexity', 'multiplier'].includes(l.kind) && l.detail;
  const sameAsGroup = l.label === groupName && l.detail;
  const title = sameAsGroup ? l.detail : chosen ? `${l.label}: ${l.detail}` : l.label;
  const showDetail = l.detail && !chosen && !sameAsGroup ? l.detail : '';
  const note = [showDetail, desc].filter(Boolean).join('. ').replace(/\.\./g, '.');
  return html`<div class="qd-item">${title}</div>${note ? html`<div class="qd-detail">${note}</div>` : ''}`;
}

export function renderQuoteDoc(quote, business = {}) {
  const lines = (quote.lines || []).filter((l) => l.showOnQuote !== false);
  const once = lines.filter((l) => !l.recurring);
  const recurring = lines.filter((l) => l.recurring);
  const t = quote.totals || {};
  const adj = (quote.adjustments || []).filter((a) => a.showOnQuote !== false);
  const c = quote.clientSnapshot || {};
  const milestones = milestoneAmounts(quote.payment?.milestones || [], t.total || 0);
  const scope = quote.scope || {};
  const included = nonEmpty(scope.included);
  const excluded = nonEmpty(scope.excluded);
  const assumptions = nonEmpty(scope.assumptions);
  const terms = (quote.terms || []).filter((x) => x.title || x.body);
  const bank = business.bank || {};
  const hasBank = bank.bankName || bank.accountNumber;
  const fromLines = [business.address, [business.email, business.phone].filter(Boolean).join(' · '), business.website,
    business.vatNumber ? `VAT no. ${business.vatNumber}` : '', business.registrationNumber ? `Reg. no. ${business.registrationNumber}` : '']
    .filter(Boolean).join('\n');
  const toLines = [c.contactName, c.address, [c.email, c.phone].filter(Boolean).join(' · '), c.vatNumber ? `VAT no. ${c.vatNumber}` : ''].filter(Boolean).join('\n');
  const showSubtotal = adj.length || t.vatRegistered || t.floorApplied;

  return html`
  <article class="qdoc">
    <header class="qd-top">
      <div class="qd-from">
        ${business.logoUrl ? html`<img class="qd-logo" src="${business.logoUrl}" alt="">` : ''}
        <div class="name">${business.name || ''}</div>
        ${business.tradingName ? html`<div class="trading">${business.tradingName}</div>` : ''}
        <div class="lines">${fromLines}</div>
      </div>
      <div class="qd-meta">
        <div class="kind">Quote</div>
        <div class="number">${quote.number || 'Draft'}</div>
        <dl>
          <dt>Date</dt><dd>${date(quote.issueDate || quote.updatedAt || new Date())}</dd>
          ${quote.validUntil ? html`<dt>Valid until</dt><dd>${date(quote.validUntil)}</dd>` : ''}
          ${quote.revision > 1 ? html`<dt>Revision</dt><dd>${quote.revision}</dd>` : ''}
        </dl>
      </div>
    </header>

    <hr class="qd-rule">

    <section class="qd-to">
      <div>
        <div class="qd-label">Prepared for</div>
        <div class="company">${c.company || c.contactName || 'Client'}</div>
        <div class="lines">${toLines}</div>
      </div>
      ${quote.timeline?.weeks ? html`<div>
        <div class="qd-label">Estimated timeline</div>
        <div class="company">${quote.timeline.weeks} ${quote.timeline.weeks === 1 ? 'week' : 'weeks'}</div>
        <div class="lines">${quote.timeline.note || 'From receipt of the signed quote and deposit.'}</div>
      </div>` : ''}
    </section>

    <h1 class="qd-title">${quote.title || 'Project quote'}</h1>
    ${quote.summary ? html`<p class="qd-summary">${quote.summary}</p>` : ''}

    ${once.length ? html`
      <h2 class="qd-h">Scope and pricing</h2>
      <table class="qd-items">
        <thead><tr><th>Item</th><th class="num">Amount</th></tr></thead>
        ${groupLines(once).map((g) => {
          // Heading and first line share a tbody that may not split, so a heading is never
          // stranded at the foot of a page; the rest of a long group flows freely.
          const row = (l) => html`<tr><td>${lineBody(l, g.name)}</td><td class="num">${amountCell(l)}</td></tr>`;
          return html`<tbody class="qd-group"><tr class="group"><td colspan="2">${g.name}</td></tr>${row(g.lines[0])}</tbody>
            ${g.lines.length > 1 ? html`<tbody>${g.lines.slice(1).map(row)}</tbody>` : ''}`;
        })}
      </table>
      <div class="qd-totals">
        ${showSubtotal ? html`<div class="row"><span class="k">Subtotal</span><span class="v num">${money(t.base)}</span></div>` : ''}
        ${adj.map((a) => html`<div class="row"><span class="k">${a.label} (${percent(a.percent)})</span><span class="v num">${money(a.amount)}</span></div>`)}
        ${t.floorApplied ? html`<div class="row"><span class="k">Minimum project fee applies</span><span class="v num">${money(t.subtotal)}</span></div>` : ''}
        ${t.vatRegistered ? html`<div class="row"><span class="k">VAT (${percent(t.vatRate)})</span><span class="v num">${money(t.vat)}</span></div>` : ''}
        <div class="row grand"><span class="k">Total once-off</span><span class="v num">${money(t.total)}</span></div>
        <div class="qd-vatnote">${t.vatRegistered ? 'Amounts include VAT where shown.' : 'Not registered for VAT. No VAT is charged.'}</div>
      </div>` : ''}

    ${recurring.length ? html`<section class="qd-block">
      <h2 class="qd-h">Monthly services</h2>
      <table class="qd-items">
        <thead><tr><th>Service</th><th class="num">Per month</th></tr></thead>
        <tbody>${recurring.map((l) => html`<tr><td>${lineBody(l, 'Recurring')}</td><td class="num">${amountCell(l)}</td></tr>`)}</tbody>
      </table>
      <div class="qd-totals">
        ${t.vatRegistered ? html`<div class="row"><span class="k">VAT (${percent(t.vatRate)})</span><span class="v num">${money(t.monthlyVat)}</span></div>` : ''}
        <div class="row grand"><span class="k">Total per month</span><span class="v num">${money(t.monthly)}</span></div>
        <div class="qd-vatnote">Billed monthly from launch.</div>
      </div></section>` : ''}

    ${milestones.length ? html`
      <div class="qd-block">
        <h2 class="qd-h">Payment schedule</h2>
        <table class="qd-milestones"><tbody>
          ${milestones.map((m) => html`<tr><td class="pct num">${percent(m.percent)}</td><td>${m.label}</td><td class="num">${money(m.amount)}</td></tr>`)}
        </tbody></table>
      </div>` : ''}

    ${included.length || excluded.length || assumptions.length ? html`
      <div class="qd-scope">
        ${included.length ? html`<div class="qd-block"><h2 class="qd-h">Included</h2><ul class="qd-list">${included.map((x) => html`<li>${x}</li>`)}</ul></div>` : ''}
        ${excluded.length ? html`<div class="qd-block"><h2 class="qd-h">Not included</h2><ul class="qd-list">${excluded.map((x) => html`<li>${x}</li>`)}</ul></div>` : ''}
        ${assumptions.length ? html`<div class="qd-block"><h2 class="qd-h">Assumptions</h2><ul class="qd-list">${assumptions.map((x) => html`<li>${x}</li>`)}</ul></div>` : ''}
      </div>` : ''}

    ${terms.length ? html`
      <section class="qd-terms">
        <h2 class="qd-h">Terms</h2>
        <ol>${terms.map((x) => html`<li><div class="term"><h4>${x.title}</h4><p>${x.body}</p></div></li>`)}</ol>
      </section>` : ''}

    ${hasBank ? html`
      <section class="qd-bank qd-block">
        <h2 class="qd-h">Banking details</h2>
        <dl>
          ${bank.accountName ? html`<dt>Account name</dt><dd>${bank.accountName}</dd>` : ''}
          ${bank.bankName ? html`<dt>Bank</dt><dd>${bank.bankName}</dd>` : ''}
          ${bank.accountNumber ? html`<dt>Account number</dt><dd class="mono">${bank.accountNumber}</dd>` : ''}
          ${bank.branchCode ? html`<dt>Branch code</dt><dd class="mono">${bank.branchCode}</dd>` : ''}
          ${bank.accountType ? html`<dt>Account type</dt><dd>${bank.accountType}</dd>` : ''}
          <dt>Reference</dt><dd class="mono">${quote.number || 'Quote number'}</dd>
        </dl>
      </section>` : ''}

    <section class="qd-accept">
      <h2 class="qd-h">Acceptance</h2>
      <p>I accept this quote and the terms above on behalf of ${c.company || 'the client'}.</p>
      <div class="qd-sign"><div>Signature</div><div>Full name</div><div>Date</div></div>
    </section>

    <footer class="qd-foot">
      <span>${business.tradingName || business.name || ''}</span>
      <span>${quote.number || ''}</span>
    </footer>
  </article>`;
}
