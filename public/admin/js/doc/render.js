import { html } from '../lib/html.js';
import { money, date, percent } from '../lib/format.js';
import { milestoneAmounts } from '../pricing/engine.js';

// Renders the client-facing quote. Pure markup from data, so the same output serves the
// print route, the saved HTML snapshot and a future share link.

// The site's own mark, used until a logo is uploaded under Settings. Absolute so the
// saved HTML snapshot still shows it when opened from anywhere.
export const DEFAULT_LOGO = 'https://dillonwernich.co.za/android-chrome-512x512.png';

const nonEmpty = (v) => (Array.isArray(v) ? v.filter((x) => String(x || '').trim()) : []);

const plural = (n, unit) => `${n} ${unit || 'unit'}${n === 1 ? '' : 's'}`;

function amountCell(l) {
  if (!l.amount) return 'Included';
  return money(l.amount);
}

// A chosen option prints as the item itself ("Brochure site", not "Project type:
// Brochure site"). Per-unit lines show the count and unit price.
function lineBody(l) {
  const chosen = l.kind === 'single-select' && l.detail;
  const title = chosen ? l.detail : l.label;
  const notes = [];
  if (l.kind === 'quantity' && l.qty) {
    const billable = l.qty - (l.included || 0);
    let q = plural(l.qty, l.unit);
    if (l.included) q += `, ${l.included} included`;
    if (l.unitPrice != null && l.amount && billable > 0) q += l.included ? `, ${billable} × ${money(l.unitPrice)}` : ` × ${money(l.unitPrice)}`;
    notes.push(q);
  } else if (l.kind === 'multi-select' && l.detail) {
    notes.push(l.detail);
  }
  if (l.clientDescription) notes.push(l.clientDescription);
  return html`<div class="qd-item">${title}</div>${notes.length ? html`<div class="qd-detail">${notes.join(' · ')}</div>` : ''}`;
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
  const timeline = String(quote.timeline?.note || '').trim();
  const fromLines = [business.address, [business.email, business.phone].filter(Boolean).join(' · '), business.website,
    business.vatNumber ? `VAT no. ${business.vatNumber}` : '', business.registrationNumber ? `Reg. no. ${business.registrationNumber}` : '']
    .filter(Boolean).join('\n');
  const toLines = [c.contactName, c.address, [c.email, c.phone].filter(Boolean).join(' · '), c.vatNumber ? `VAT no. ${c.vatNumber}` : ''].filter(Boolean).join('\n');
  const showSubtotal = adj.length || t.vatRegistered;
  const scopeBlocks = [['Included', included], ['Not included', excluded], ['Assumptions', assumptions]].filter(([, list]) => list.length);

  return html`
  <article class="qdoc">
    <header class="qd-top">
      <img class="qd-logo" src="${business.logoUrl || DEFAULT_LOGO}" alt="">
      <div class="qd-from">
        <div class="name">${business.tradingName || business.name || ''}</div>
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

    <section class="qd-to">
      <div>
        <div class="qd-label">Prepared for</div>
        <div class="company">${c.company || c.contactName || 'Client'}</div>
        <div class="lines">${toLines}</div>
      </div>
      ${timeline ? html`<div>
        <div class="qd-label">Timeline</div>
        <div class="company">${timeline}</div>
      </div>` : ''}
    </section>

    <h1 class="qd-title">${quote.title || 'Project quote'}</h1>
    ${quote.summary ? html`<p class="qd-summary">${quote.summary}</p>` : ''}

    ${once.length ? html`
      <table class="qd-items">
        <thead><tr><th>Item</th><th class="num">Amount</th></tr></thead>
        <tbody>${once.map((l) => html`<tr><td>${lineBody(l)}</td><td class="num">${amountCell(l)}</td></tr>`)}</tbody>
      </table>
      <div class="qd-totals">
        ${showSubtotal ? html`<div class="row"><span class="k">Subtotal</span><span class="v num">${money(t.base)}</span></div>` : ''}
        ${adj.map((a) => html`<div class="row"><span class="k">${a.label} (${percent(a.percent)})</span><span class="v num">${money(a.amount)}</span></div>`)}
        ${t.vatRegistered ? html`<div class="row"><span class="k">VAT (${percent(t.vatRate)})</span><span class="v num">${money(t.vat)}</span></div>` : ''}
        <div class="row grand"><span class="k">Total</span><span class="v num">${money(t.total)}</span></div>
        <div class="qd-vatnote">${t.vatRegistered ? 'Amounts include VAT where shown.' : 'Not registered for VAT. No VAT is charged.'}</div>
      </div>` : ''}

    ${recurring.length ? html`<section class="qd-block">
      <h2 class="qd-h">Monthly</h2>
      <table class="qd-items">
        <tbody>${recurring.map((l) => html`<tr><td>${lineBody(l)}</td><td class="num">${amountCell(l)}</td></tr>`)}</tbody>
      </table>
      <div class="qd-totals">
        ${t.vatRegistered ? html`<div class="row"><span class="k">VAT (${percent(t.vatRate)})</span><span class="v num">${money(t.monthlyVat)}</span></div>` : ''}
        <div class="row grand"><span class="k">Per month</span><span class="v num">${money(t.monthly)}</span></div>
        <div class="qd-vatnote">Billed monthly from launch.</div>
      </div></section>` : ''}

    ${milestones.length ? html`
      <section class="qd-block">
        <h2 class="qd-h">Payment</h2>
        <table class="qd-milestones"><tbody>
          ${milestones.map((m) => html`<tr><td class="pct num">${percent(m.percent)}</td><td>${m.label}</td><td class="num">${money(m.amount)}</td></tr>`)}
        </tbody></table>
      </section>` : ''}

    ${scopeBlocks.length ? html`
      <div class="qd-scope cols-${scopeBlocks.length}">
        ${scopeBlocks.map(([title, list]) => html`<div class="qd-block"><h2 class="qd-h">${title}</h2><ul class="qd-list">${list.map((x) => html`<li>${x}</li>`)}</ul></div>`)}
      </div>` : ''}

    ${terms.length ? html`
      <section class="qd-terms">
        <h2 class="qd-h">Terms</h2>
        <ol>${terms.map((x) => html`<li><div class="term"><h4>${x.title}</h4><p>${x.body}</p></div></li>`)}</ol>
      </section>` : ''}

    <section class="qd-end">
      ${hasBank ? html`
        <div class="qd-bank qd-block">
          <h2 class="qd-h">Banking details</h2>
          <dl>
            ${bank.accountName ? html`<dt>Account name</dt><dd>${bank.accountName}</dd>` : ''}
            ${bank.bankName ? html`<dt>Bank</dt><dd>${bank.bankName}</dd>` : ''}
            ${bank.accountNumber ? html`<dt>Account number</dt><dd class="mono">${bank.accountNumber}</dd>` : ''}
            ${bank.branchCode ? html`<dt>Branch code</dt><dd class="mono">${bank.branchCode}</dd>` : ''}
            ${bank.accountType ? html`<dt>Account type</dt><dd>${bank.accountType}</dd>` : ''}
            <dt>Reference</dt><dd class="mono">${quote.number || 'Quote number'}</dd>
          </dl>
        </div>` : ''}
      <div class="qd-accept qd-block">
        <h2 class="qd-h">Acceptance</h2>
        <p>Signed on behalf of ${c.company || 'the client'} to accept this quote and its terms.</p>
        <div class="qd-sign"><div>Signature</div><div>Name</div><div>Date</div></div>
      </div>
    </section>

    <footer class="qd-foot">
      <span>${business.tradingName || business.name || ''}</span>
      <span>${quote.number || ''}</span>
    </footer>
  </article>`;
}
