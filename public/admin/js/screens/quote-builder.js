import { html, attr } from '../lib/html.js';
import { money, hours, time, isoDay, toDate, percent, dateTime } from '../lib/format.js';
import { state, lib, getVersion, statusById, roleOf, quoteActivity, logQuote, create, logClient, Timestamp } from '../data/store.js';
import { isSelected, describePrice } from '../pricing/engine.js';
import { icon } from '../ui/icons.js';
import { statusBadge, skeletonBlock } from '../ui/blocks.js';
import { menu, confirm, drawer } from '../ui/overlay.js';
import * as f from '../ui/fields.js';
import { toast, toastError } from '../ui/toast.js';
import { navigate } from '../router.js';
import { setMeta } from '../shell.js';
import { clone, debounce, sortBy, byOrder } from '../lib/util.js';
import {
  blankQuote, priced, createQuote, saveQuote, setStatus, createRevision, duplicateQuote, deleteQuote,
  clientSnapshot, milestonesFor,
} from './quote-lifecycle.js';

const SCOPE = [
  { key: 'included', label: 'Included' },
  { key: 'excluded', label: 'Not included' },
  { key: 'assumptions', label: 'Assumptions' },
];

export default async function quoteBuilder(view) {
  const existingId = view.params.id || null;
  let id = existingId;
  let q;
  let config;

  if (existingId) {
    const found = state.quotes.get(existingId);
    if (!found) {
      view.header({ title: 'Quote not found', crumb: { href: '/admin/quotes/', label: 'Quotes' } });
      view.el.innerHTML = String(html`<div class="panel"><div class="empty"><p>This quote does not exist or was deleted.</p><a class="btn" href="/admin/quotes/">All quotes</a></div></div>`);
      return;
    }
    q = clone(found);
    config = await getVersion(q.pricingVersionId);
  } else {
    config = state.pricing;
    q = blankQuote({ clientId: view.params.query.client || null });
  }

  let dirty = false;
  let saving = false;
  let loggedEdit = false;
  let savedAt = existingId ? toDate(q.updatedAt) : null;
  const isDraft = () => roleOf(q) === 'draft';

  view.guard(() => dirty);

  // ---------- header ----------

  const drawHeader = () => {
    const status = statusById(q.status);
    view.header({
      title: q.number || q.title || (id ? 'Untitled quote' : 'New quote'),
      crumb: { href: '/admin/quotes/', label: 'Quotes' },
      actions: html`
        ${id ? html`<button type="button" class="btn" data-act="status" aria-label="Change status">${statusBadge(status)}${icon('chevronDown')}</button>` : ''}
        ${id ? html`<a class="btn hide-sm" href="/admin/quotes/${id}/print/">${icon('printer')}Print</a>` : ''}
        <button type="button" class="btn btn-primary" data-act="save">Save</button>
        ${id ? html`<button type="button" class="icon-btn" data-act="more" aria-label="More actions">${icon('more')}</button>` : ''}`,
    });
    drawSaveState();
  };

  const drawSaveState = () => {
    let text = '';
    let cls = 'save-state';
    if (saving) text = 'Saving';
    else if (dirty) { text = isDraft() ? 'Unsaved' : 'Unsaved changes'; cls += ' dirty'; }
    else if (savedAt) text = `Saved · ${time(savedAt)}`;
    setMeta(html`<span class="${cls}">${text}</span>`);
    // On phones the top bar has no room, so the bottom sheet carries the state too.
    const sheet = view.el.querySelector('[data-sheet-state]');
    if (sheet) { sheet.className = cls; sheet.textContent = text; }
  };

  // ---------- persistence ----------

  const persist = async () => {
    if (saving) return;
    saving = true;
    drawSaveState();
    try {
      Object.assign(q, priced(q, config));
      const { id: _drop, createdAt, updatedAt, ...data } = q;
      if (!id) {
        id = await createQuote(data);
        history.replaceState({}, '', `/admin/quotes/${id}/`);
      } else {
        await saveQuote(id, data);
        if (!loggedEdit) { loggedEdit = true; await logQuote(id, 'edited'); }
      }
      dirty = false;
      savedAt = new Date();
      drawHeader();
    } catch (e) {
      toastError(e, 'Could not save the quote.');
    } finally {
      saving = false;
      drawSaveState();
    }
  };

  const autosave = debounce(() => { if (isDraft()) persist(); }, 1500);
  view.onCleanup(() => autosave.cancel());

  const changed = ({ reprice = true, items = false } = {}) => {
    dirty = true;
    if (reprice) Object.assign(q, priced(q, config));
    drawSummary();
    drawDerived();
    if (items) drawItems();
    drawSaveState();
    autosave();
  };

  // ---------- layout ----------

  const versionNote = () => {
    const current = state.pricing;
    if (!current || current.id === config.id) return '';
    return html`<div class="notice info">${icon('pricing')}<div>Priced against pricing version ${config.number}. The current version is ${current.number}.
      <button type="button" class="btn btn-sm notice-action" data-act="reprice">Reprice with current pricing</button></div></div>`;
  };

  const sentNote = () => (id && !isDraft() && roleOf(q) !== 'superseded'
    ? html`<div class="notice">${icon('quotes')}<div>This quote is ${statusById(q.status)?.label.toLowerCase()}. Changes are saved manually. Create a revision if the client should see a new version.</div></div>`
    : '');

  view.el.innerHTML = String(html`
    <div class="builder">
      <div class="builder-form">
        <div data-notes>${versionNote()}${sentNote()}</div>

        <section class="panel b-section">
          <div class="panel-head"><span class="b-num">01</span><h2>Client</h2></div>
          <div class="panel-body" data-client></div>
        </section>

        <section class="panel b-section">
          <div class="panel-head"><span class="b-num">02</span><h2>Project</h2></div>
          <div class="panel-body stack">
            <div class="grid">
              ${f.text('title', 'Title', q.title, { placeholder: 'Website redesign for Mthembu Attorneys' })}
              ${f.textarea('summary', 'Summary', q.summary, { rows: 3, placeholder: 'One paragraph on what the project is and why it matters to the client.' })}
              <div class="grid g2">${f.date('validUntil', 'Valid until', isoDay(q.validUntil))}</div>
            </div>
            <div class="stack" data-items></div>
          </div>
        </section>

        <section class="panel b-section">
          <div class="panel-head"><span class="b-num">03</span><h2>Scope detail</h2></div>
          <div class="panel-body stack" data-scope></div>
        </section>

        <section class="panel b-section">
          <div class="panel-head"><span class="b-num">04</span><h2>Timeline</h2></div>
          <div class="panel-body" data-timeline></div>
        </section>

        <section class="panel b-section">
          <div class="panel-head"><span class="b-num">05</span><h2>Payment schedule</h2></div>
          <div class="panel-body" data-payment></div>
        </section>

        <section class="panel b-section">
          <div class="panel-head"><span class="b-num">06</span><h2>Terms</h2></div>
          <div class="panel-body" data-terms></div>
        </section>

        <section class="panel b-section">
          <div class="panel-head"><span class="b-num">07</span><h2>Internal</h2><span class="badge">Not on the quote</span></div>
          <div class="panel-body" data-internal></div>
        </section>

        ${id ? html`<section class="panel"><div class="panel-head"><h2>Activity</h2></div><div class="panel-body" data-activity>${skeletonBlock(3)}</div></section>` : ''}
      </div>
      <aside class="builder-side" data-side></aside>
    </div>`);

  const $ = (sel) => view.el.querySelector(sel);

  // ---------- 01 client ----------

  const drawClient = () => {
    const clients = sortBy([...state.clients.values()].filter((c) => !c.mergedInto), (c) => c.company || c.contactName);
    const c = q.clientSnapshot;
    $('[data-client]').innerHTML = String(html`
      <div class="grid">
        <div class="btn-row">
          <select class="select grow" name="clientId" aria-label="Client">
            <option value="">Choose a client</option>
            ${clients.map((x) => html`<option value="${x.id}"${attr(x.id === q.clientId, 'selected')}>${x.company || x.contactName}${x.company && x.contactName ? ` · ${x.contactName}` : ''}</option>`)}
          </select>
          <button type="button" class="btn" data-act="new-client">${icon('plus')}New client</button>
        </div>
        ${c ? html`<dl class="kv">
          ${c.contactName ? html`<dt>Contact</dt><dd>${c.contactName}</dd>` : ''}
          ${c.email ? html`<dt>Email</dt><dd>${c.email}</dd>` : ''}
          ${c.phone ? html`<dt>Phone</dt><dd>${c.phone}</dd>` : ''}
          ${c.address ? html`<dt>Address</dt><dd>${c.address}</dd>` : ''}
          ${c.vatNumber ? html`<dt>VAT no.</dt><dd>${c.vatNumber}</dd>` : ''}
        </dl>` : ''}
        ${q.clientId && state.clients.get(q.clientId) && JSON.stringify(clientSnapshot(state.clients.get(q.clientId))) !== JSON.stringify(c)
          ? html`<div><button type="button" class="btn btn-sm" data-act="refresh-client">Update from client record</button></div>` : ''}
      </div>`);
  };

  // ---------- 02 pricing items ----------

  const sections = () => [...config.sections].sort(byOrder).filter((s) => s.visible !== false || s.items.some((it) => isSelected(it, q.selections[it.id])));
  const lineFor = (itemId) => (q.lines || []).find((l) => l.itemId === itemId);
  const fmtPrice = (p) => describePrice(p, config.core.hourlyRate, money);

  const control = (it) => {
    const sel = q.selections[it.id];
    switch (it.kind) {
      case 'single-select':
      case 'complexity':
      case 'multiplier':
        return html`<div class="chips">${it.options.filter((o) => o.visible !== false || o.id === sel).map((o) => html`
          <button type="button" class="chip" data-item="${it.id}" data-opt="${o.id}" aria-pressed="${o.id === sel}" title="${it.kind === 'multiplier' ? `× ${o.multiplier ?? 1}` : fmtPrice(o.price)}">${o.label}</button>`)}</div>`;
      case 'multi-select':
        return html`<div class="chips">${it.options.filter((o) => o.visible !== false || (sel || []).includes(o.id)).map((o) => html`
          <button type="button" class="chip" data-item="${it.id}" data-opt="${o.id}" aria-pressed="${(sel || []).includes(o.id)}" title="${fmtPrice(o.price)}">${o.label}</button>`)}</div>`;
      case 'quantity': {
        const variants = it.options.length ? it.options.filter((o) => o.visible !== false || Number(sel?.[o.id]) > 0) : [{ id: '_', label: it.unit ? `${it.unit[0].toUpperCase()}${it.unit.slice(1)}s` : 'Quantity' }];
        return html`<div class="stack-sm">${variants.map((o) => html`<label class="qty-row"><span>${o.label}</span>
          <input class="input num" type="number" min="0" step="1" inputmode="numeric" data-item="${it.id}" data-qty="${o.id}" value="${sel?.[o.id] || ''}" placeholder="0"></label>`)}</div>`;
      }
      case 'toggle':
        return html`<label class="check"><input type="checkbox" data-item="${it.id}" data-toggle${attr(!!sel, 'checked')}><span>${fmtPrice(it.price)}${it.recurring ? ' per month' : ''}</span></label>`;
      case 'percentage':
        return html`<div class="btn-row">
          <label class="check"><input type="checkbox" data-item="${it.id}" data-pct-on${attr(!!sel?.on, 'checked')}><span>Apply</span></label>
          <div class="affix w-sm"><input class="input num" type="number" step="0.5" data-item="${it.id}" data-pct value="${sel?.percent ?? it.percent}"><span class="post">%</span></div>
        </div>`;
      default:
        return '';
    }
  };

  const itemPriceText = (it) => {
    const line = lineFor(it.id);
    if (it.kind === 'percentage') {
      const a = (q.adjustments || []).find((x) => x.itemId === it.id);
      return a ? `${percent(a.percent)} · ${money(a.amount)}` : '';
    }
    if (!line) return '';
    if (it.kind === 'multiplier') return line.detail ? `× ${(it.options.find((o) => o.label === line.detail)?.multiplier ?? 1)}` : '';
    if (!line.amount) return line.detail ? `Included · ${line.detail}` : 'Included';
    return `${money(line.amount)}${line.recurring ? ' per month' : ''}${line.hours ? ` · ${hours(line.hours)}` : ''}`;
  };

  const drawItems = () => {
    $('[data-items]').innerHTML = String(html`${sections().map((s) => html`
      <div class="stack-sm">
        <div><div class="eyebrow">${s.name}</div>${s.description ? html`<div class="desc">${s.description}</div>` : ''}</div>
        <div>${[...s.items].sort(byOrder).filter((it) => it.visible !== false || isSelected(it, q.selections[it.id])).map((it) => html`
          <div class="item-row" data-row="${it.id}">
            <div>
              <div class="item-label">${it.label}${it.visible === false ? html` <span class="badge">Hidden</span>` : ''}${it.recurring ? html` <span class="badge">Monthly</span>` : ''}</div>
              ${it.description ? html`<div class="item-desc">${it.description}</div>` : ''}
              <div class="item-price" data-price="${it.id}">${itemPriceText(it)}</div>
            </div>
            <div class="item-ctl">${control(it)}</div>
          </div>`)}</div>
      </div>`)}`);
  };

  const refreshItemPrices = () => {
    for (const s of config.sections) for (const it of s.items) {
      const elm = view.el.querySelector(`[data-price="${it.id}"]`);
      if (elm) elm.textContent = itemPriceText(it);
    }
  };

  // ---------- 03 scope ----------

  const drawScope = () => {
    $('[data-scope]').innerHTML = String(html`${SCOPE.map((s) => html`
      <div class="stack-sm">
        <div class="btn-row"><div class="section-title grow">${s.label}</div>
          <button type="button" class="btn btn-sm" data-act="scope-template" data-kind="${s.key}">From templates</button>
          <button type="button" class="btn btn-sm" data-act="scope-add" data-kind="${s.key}">${icon('plus')}Add</button></div>
        <div class="list-edit">${(q.scope?.[s.key] || []).map((text, i) => html`
          <div class="le-row"><span class="faint mono le-num">${i + 1}</span>
            <textarea class="textarea" rows="1" data-scope="${s.key}" data-i="${i}">${text}</textarea>
            <button type="button" class="icon-btn" data-act="scope-remove" data-kind="${s.key}" data-i="${i}" aria-label="Remove">${icon('x')}</button></div>`)}
          ${!(q.scope?.[s.key] || []).length ? html`<div class="faint">None.</div>` : ''}
        </div>
      </div>`)}`);
  };

  // ---------- 04 timeline ----------

  const drawTimeline = () => {
    const qd = state.settings.quoteDefaults || {};
    const t = q.timeline || {};
    $('[data-timeline]').innerHTML = String(html`<div class="grid g2">
      <div class="field"><span class="label">Estimate</span>
        <div class="muted" data-est>${hours(q.internal?.hoursOverride || q.totals?.hours)} at ${qd.hoursPerWeek || 20} h a week</div></div>
      <div class="field"><label class="label" for="f-weeks">Weeks</label>
        <div class="btn-row"><input class="input num w-xs" id="f-weeks" type="number" min="1" step="1" data-weeks value="${t.weeks}"${attr(!t.override, 'disabled')}>
        <label class="check"><input type="checkbox" data-weeks-override${attr(t.override, 'checked')}><span>Override</span></label></div></div>
      ${f.text('timelineNote', 'Note on the quote', t.note || '', { placeholder: 'From receipt of the signed quote and deposit.', cls: 'span2' })}
    </div>`);
  };

  // ---------- 05 payment ----------

  const drawPayment = () => {
    const templates = lib('paymentTemplates');
    const ms = milestonesFor(q);
    const sum = (q.payment?.milestones || []).reduce((n, m) => n + (Number(m.percent) || 0), 0);
    $('[data-payment]').innerHTML = String(html`<div class="stack-sm">
      ${f.select('paymentTemplate', 'Template', q.payment?.templateId || '', templates.map((t) => ({ value: t.id, label: t.label })), { empty: 'Custom' })}
      <div class="milestones">
        ${ms.map((m, i) => html`<div class="ms-row">
          <input class="input" data-ms="${i}" data-ms-field="label" value="${m.label}" aria-label="Milestone">
          <div class="affix"><input class="input num" type="number" step="1" min="0" data-ms="${i}" data-ms-field="percent" value="${m.percent}" aria-label="Percent"><span class="post">%</span></div>
          <div class="num right ms-amt" data-ms-amt="${i}">${money(m.amount)}</div>
          <button type="button" class="icon-btn" data-act="ms-remove" data-i="${i}" aria-label="Remove milestone">${icon('x')}</button>
        </div>`)}
      </div>
      <div class="btn-row"><button type="button" class="btn btn-sm" data-act="ms-add">${icon('plus')}Add milestone</button>
        <span data-ms-sum class="${sum === 100 ? 'faint' : 'badge warn'}">${sum === 100 ? 'Adds up to 100%.' : `Adds up to ${sum}%.`}</span></div>
    </div>`);
  };

  // ---------- 06 terms ----------

  const drawTerms = () => {
    const library = lib('terms');
    const chosen = q.terms || [];
    const custom = chosen.filter((t) => !library.some((l) => l.id === t.id));
    const all = [...library.map((l) => chosen.find((c) => c.id === l.id) || { ...l, off: true }), ...custom];
    $('[data-terms]').innerHTML = String(html`${all.map((t) => {
      const on = !t.off;
      return html`<div class="term-row">
        <label class="check"><input type="checkbox" data-term="${t.id}"${attr(on, 'checked')}><span>${t.title || 'Untitled clause'}</span></label>
        ${on ? html`<textarea class="textarea" rows="2" data-term-body="${t.id}">${t.body}</textarea>` : ''}
      </div>`;
    })}
    <button type="button" class="btn btn-sm" data-act="term-add">${icon('plus')}Add clause for this quote</button>`);
  };

  // ---------- 07 internal ----------

  const drawInternal = () => {
    $('[data-internal]').innerHTML = String(html`<div class="grid g2">
      ${f.textarea('internalNotes', 'Notes', q.internal?.notes || '', { rows: 3, cls: 'span2' })}
      ${f.number('hoursOverride', 'Estimated hours', q.internal?.hoursOverride ?? '', { hint: `calculated ${hours(q.totals?.hours)}`, min: 0, suffix: 'h' })}
      <div class="field"><span class="label">Readout</span><div data-internal-readout></div></div>
    </div>`);
    drawInternalReadout();
  };

  const effective = () => {
    const h = Number(q.internal?.hoursOverride) || q.totals?.hours || 0;
    return h > 0 ? Math.round((q.totals?.subtotal || 0) / h) : 0;
  };

  const drawInternalReadout = () => {
    const elm = $('[data-internal-readout]');
    if (!elm) return;
    const threshold = Number(state.settings.quoteDefaults?.marginThreshold) || 0;
    const rate = effective();
    elm.innerHTML = String(html`<div class="readout">
      <div>Effective rate <strong class="num">${money(rate)}</strong> an hour</div>
      <div class="faint">Complexity score ${q.totals?.score || 0}</div>
      ${threshold && rate && rate < threshold ? html`<div><span class="badge warn">Below your ${money(threshold)} threshold</span></div>` : ''}
    </div>`);
  };

  // ---------- summary ----------

  const drawSummary = () => {
    const t = q.totals || {};
    const threshold = Number(state.settings.quoteDefaults?.marginThreshold) || 0;
    const rate = effective();
    const once = (q.lines || []).filter((l) => !l.recurring && l.amount);
    $('[data-side]').innerHTML = String(html`
      <div class="summary">
        <button type="button" class="sheet-bar" data-act="sheet"><span>Total <span data-sheet-state></span></span><span class="num">${money(t.total)}</span></button>
        <div class="summary-head"><div class="eyebrow">Summary</div></div>
        <div class="summary-body">
          <div class="sum-lines">${once.map((l) => html`<div class="sum-row"><span class="k">${l.label}${l.detail && l.kind !== 'quantity' ? `: ${l.detail}` : ''}</span><span class="num">${money(l.amount)}</span></div>`)}</div>
          <div class="sum-sep"></div>
          <div class="sum-row"><span class="k">Once-off subtotal</span><span class="num">${money(t.base)}</span></div>
          ${(q.adjustments || []).map((a) => html`<div class="sum-row"><span class="k">${a.label} (${percent(a.percent)})</span><span class="num">${money(a.amount)}</span></div>`)}
          ${t.floorApplied ? html`<div class="sum-row sub"><span class="k">Minimum fee applied</span><span class="num">${money(t.floor)}</span></div>` : ''}
          ${t.vatRegistered ? html`<div class="sum-row"><span class="k">VAT (${percent(t.vatRate)})</span><span class="num">${money(t.vat)}</span></div>` : html`<div class="sum-row sub"><span class="k">No VAT charged</span><span></span></div>`}
          <div class="sum-row total"><span>Once-off total</span><span class="num">${money(t.total)}</span></div>
          <div class="sum-row"><span class="k">Monthly recurring</span><span class="num">${money(t.monthly)}</span></div>
          <div class="sum-row"><span class="k">Timeline</span><span class="num">${q.timeline?.weeks || 1} ${q.timeline?.weeks === 1 ? 'week' : 'weeks'}</span></div>
          <div class="sum-internal">
            <div class="eyebrow">Internal</div>
            <div class="sum-row sub"><span class="k">Effective rate</span><span class="num">${money(rate)} / h</span></div>
            <div class="sum-row sub"><span class="k">Hours</span><span class="num">${hours(Number(q.internal?.hoursOverride) || t.hours)}</span></div>
            ${threshold && rate && rate < threshold ? html`<div class="badge warn">Below margin threshold</div>` : ''}
          </div>
        </div>
      </div>`);
    drawSaveState();
  };

  // Updates the parts that depend on totals without rebuilding inputs mid-typing.
  const drawDerived = () => {
    refreshItemPrices();
    const est = $('[data-est]');
    if (est) est.textContent = `${hours(q.internal?.hoursOverride || q.totals?.hours)} at ${state.settings.quoteDefaults?.hoursPerWeek || 20} h a week`;
    const weeks = $('[data-weeks]');
    if (weeks && !q.timeline?.override) weeks.value = q.timeline?.weeks || 1;
    milestonesFor(q).forEach((m, i) => {
      const elm = view.el.querySelector(`[data-ms-amt="${i}"]`);
      if (elm) elm.textContent = money(m.amount);
    });
    drawInternalReadout();
  };

  const drawActivity = async () => {
    const box = $('[data-activity]');
    if (!box || !id) return;
    try {
      const items = await quoteActivity(id);
      box.innerHTML = String(items.length
        ? html`<ul class="timeline">${items.map((a) => html`<li><time>${dateTime(a.at)}</time><div>${activityText(a)}</div></li>`)}</ul>`
        : html`<div class="faint">No activity yet.</div>`);
    } catch (e) { box.textContent = 'Activity could not load.'; }
  };

  // ---------- events ----------

  view.el.addEventListener('click', async (e) => {
    const chip = e.target.closest('.chip[data-item]');
    if (chip) {
      const it = findItem(chip.dataset.item);
      const optId = chip.dataset.opt;
      if (it.kind === 'multi-select') {
        const cur = new Set(q.selections[it.id] || []);
        cur.has(optId) ? cur.delete(optId) : cur.add(optId);
        q.selections[it.id] = [...cur];
      } else {
        q.selections[it.id] = q.selections[it.id] === optId ? null : optId;
      }
      changed({ items: true });
      return;
    }

    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'sheet') { $('[data-side]').classList.toggle('open'); return; }
    if (act === 'new-client') { newClientDrawer(); return; }
    if (act === 'refresh-client') {
      q.clientSnapshot = clientSnapshot(state.clients.get(q.clientId));
      drawClient();
      changed({ reprice: false });
      return;
    }
    if (act === 'scope-add') { (q.scope[btn.dataset.kind] ||= []).push(''); drawScope(); changed({ reprice: false }); focusLast(`[data-scope="${btn.dataset.kind}"]`); return; }
    if (act === 'scope-remove') { q.scope[btn.dataset.kind].splice(Number(btn.dataset.i), 1); drawScope(); changed({ reprice: false }); return; }
    if (act === 'scope-template') { scopeMenu(btn, btn.dataset.kind); return; }
    if (act === 'ms-add') { q.payment.milestones.push({ label: 'Milestone', percent: 0 }); q.payment.templateId = null; drawPayment(); changed({ reprice: false }); return; }
    if (act === 'ms-remove') { q.payment.milestones.splice(Number(btn.dataset.i), 1); q.payment.templateId = null; drawPayment(); changed({ reprice: false }); return; }
    if (act === 'term-add') {
      q.terms.push({ id: `custom-${Date.now()}`, title: 'Additional terms', body: '' });
      drawTerms();
      changed({ reprice: false });
      return;
    }
    if (act === 'reprice') { reprice(); return; }
  });

  view.el.addEventListener('input', (e) => {
    const t = e.target;
    if (t.name === 'title') { q.title = t.value; changed({ reprice: false }); return; }
    if (t.name === 'summary') { q.summary = t.value; changed({ reprice: false }); return; }
    if (t.dataset.qty) {
      const it = findItem(t.dataset.item);
      const map = { ...(q.selections[it.id] || {}) };
      const n = Math.max(0, Math.floor(Number(t.value) || 0));
      if (n) map[t.dataset.qty] = n; else delete map[t.dataset.qty];
      q.selections[it.id] = Object.keys(map).length ? map : null;
      changed();
      return;
    }
    if (t.dataset.pct !== undefined) {
      const cur = q.selections[t.dataset.item] || { on: false };
      q.selections[t.dataset.item] = { ...cur, percent: Number(t.value) || 0 };
      changed();
      return;
    }
    if (t.dataset.scope) { q.scope[t.dataset.scope][Number(t.dataset.i)] = t.value; changed({ reprice: false }); return; }
    if (t.dataset.ms !== undefined) {
      const m = q.payment.milestones[Number(t.dataset.ms)];
      if (t.dataset.msField === 'percent') m.percent = Number(t.value) || 0; else m.label = t.value;
      q.payment.templateId = null;
      const sel = $('[name="paymentTemplate"]');
      if (sel) sel.value = '';
      const sum = q.payment.milestones.reduce((n, x) => n + (Number(x.percent) || 0), 0);
      const sumEl = $('[data-ms-sum]');
      sumEl.className = sum === 100 ? 'faint' : 'badge warn';
      sumEl.textContent = sum === 100 ? 'Adds up to 100%.' : `Adds up to ${sum}%.`;
      changed({ reprice: false });
      return;
    }
    if (t.dataset.termBody) { const term = q.terms.find((x) => x.id === t.dataset.termBody); if (term) term.body = t.value; changed({ reprice: false }); return; }
    if (t.dataset.weeks !== undefined) { q.timeline.weeks = Math.max(1, Number(t.value) || 1); changed(); return; }
    if (t.name === 'timelineNote') { q.timeline.note = t.value; changed({ reprice: false }); return; }
    if (t.name === 'internalNotes') { q.internal.notes = t.value; changed({ reprice: false }); return; }
    if (t.name === 'hoursOverride') { q.internal.hoursOverride = t.value === '' ? null : Number(t.value); changed(); return; }
  });

  view.el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'clientId') {
      q.clientId = t.value || null;
      q.clientSnapshot = clientSnapshot(state.clients.get(t.value));
      drawClient();
      changed({ reprice: false });
      return;
    }
    if (t.name === 'validUntil') { q.validUntil = t.value ? Timestamp.fromDate(new Date(`${t.value}T00:00:00`)) : null; changed({ reprice: false }); return; }
    if (t.dataset.toggle !== undefined) { q.selections[t.dataset.item] = t.checked || null; changed({ items: false }); return; }
    if (t.dataset.pctOn !== undefined) {
      const it = findItem(t.dataset.item);
      const cur = q.selections[it.id] || { percent: it.percent };
      q.selections[it.id] = { ...cur, on: t.checked };
      changed();
      return;
    }
    if (t.name === 'paymentTemplate') {
      const tpl = lib('paymentTemplates').find((x) => x.id === t.value);
      q.payment = { templateId: tpl?.id || null, milestones: clone(tpl?.milestones || q.payment.milestones) };
      drawPayment();
      changed({ reprice: false });
      return;
    }
    if (t.dataset.term) {
      const libTerm = lib('terms').find((x) => x.id === t.dataset.term);
      if (t.checked) {
        if (libTerm) q.terms.push({ id: libTerm.id, title: libTerm.title, body: libTerm.body });
      } else {
        q.terms = q.terms.filter((x) => x.id !== t.dataset.term);
      }
      drawTerms();
      changed({ reprice: false });
      return;
    }
    if (t.dataset.weeksOverride !== undefined) {
      q.timeline.override = t.checked;
      drawTimeline();
      changed();
    }
  });

  // Header actions live outside view.el.
  const headerEl = document.querySelector('[data-actions]');
  const onHeader = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'save') { autosave.cancel(); await persist(); toast('Quote saved.'); return; }
    if (act === 'status') { statusMenu(b); return; }
    if (act === 'more') { moreMenu(b); }
  };
  headerEl.addEventListener('click', onHeader);
  view.onCleanup(() => headerEl.removeEventListener('click', onHeader));

  // ---------- helpers ----------

  function findItem(itemId) {
    for (const s of config.sections) for (const it of s.items) if (it.id === itemId) return it;
    return null;
  }

  function focusLast(sel) {
    const all = view.el.querySelectorAll(sel);
    all[all.length - 1]?.focus();
  }

  function scopeMenu(anchor, kind) {
    const used = new Set(q.scope[kind] || []);
    const options = lib('scopeTemplates').filter((s) => s.kind === kind && !used.has(s.text));
    if (!options.length) { toast('Every template for this list is already added.'); return; }
    menu(anchor, options.map((s) => ({
      label: s.text.length > 60 ? `${s.text.slice(0, 57)}…` : s.text,
      onSelect: () => { q.scope[kind].push(s.text); drawScope(); changed({ reprice: false }); },
    })));
  }

  async function ensureSaved() {
    if (dirty || !id) { autosave.cancel(); await persist(); }
    return !!id && !dirty;
  }

  function statusMenu(anchor) {
    const options = lib('statuses').filter((s) => s.id !== q.status && s.role !== 'superseded');
    menu(anchor, options.map((s) => ({
      label: s.label,
      onSelect: async () => {
        if (!(await ensureSaved())) return;
        try {
          const undo = await setStatus({ ...q, id }, s.id);
          q.status = s.id;
          toast(`Marked ${s.label.toLowerCase()}.`, { undo });
          refreshAfterStatus();
        } catch (err) { toastError(err); }
      },
    })));
  }

  function refreshAfterStatus() {
    setTimeout(() => {
      const fresh = state.quotes.get(id);
      if (fresh && !dirty) q = clone(fresh);
      drawHeader();
      $('[data-notes]').innerHTML = String(html`${versionNote()}${sentNote()}`);
      drawActivity();
    }, 150);
  }

  function moreMenu(anchor) {
    menu(anchor, [
      { label: 'Print or PDF', icon: 'printer', onSelect: () => navigate(`/admin/quotes/${id}/print/`) },
      ...(q.number ? [{ label: 'Create revision', icon: 'copy', onSelect: async () => {
        if (!(await ensureSaved())) return;
        try { const nid = await createRevision({ ...q, id }); dirty = false; toast('Revision created.'); navigate(`/admin/quotes/${nid}/`, { force: true }); } catch (err) { toastError(err); }
      } }] : []),
      { label: 'Duplicate', icon: 'copy', onSelect: () => duplicateTo(q.clientId) },
      { label: 'Duplicate for another client', icon: 'clients', onSelect: () => duplicateForClient() },
      ...(state.pricing && state.pricing.id !== config.id ? [{ label: 'Reprice with current pricing', icon: 'pricing', onSelect: reprice }] : []),
      'sep',
      { label: 'Delete', icon: 'trash', danger: true, onSelect: async () => {
        if (!(await confirm({ title: 'Delete this quote?', body: q.number ? `${q.number} will not be reused.` : '', confirmLabel: 'Delete', danger: true }))) return;
        try {
          dirty = false;
          autosave.cancel();
          const undo = await deleteQuote({ ...state.quotes.get(id), id });
          toast('Quote deleted.', { undo });
          navigate('/admin/quotes/', { force: true });
        } catch (err) { toastError(err); }
      } },
    ]);
  }

  async function duplicateTo(clientId) {
    if (!(await ensureSaved())) return;
    try {
      const nid = await duplicateQuote({ ...state.quotes.get(id), id }, clientId);
      toast('Quote duplicated.');
      navigate(`/admin/quotes/${nid}/`, { force: true });
    } catch (err) { toastError(err); }
  }

  function duplicateForClient() {
    const clients = sortBy([...state.clients.values()].filter((c) => !c.mergedInto), (c) => c.company || c.contactName);
    drawer({
      title: 'Duplicate for client',
      submitLabel: 'Duplicate',
      guard: false,
      body: f.select('client', 'Client', '', clients.map((c) => ({ value: c.id, label: c.company || c.contactName })), { empty: 'No client' }),
      onSubmit: async (form) => { await duplicateTo(f.readForm(form).client || null); },
    });
  }

  async function reprice() {
    if (!(await confirm({ title: 'Reprice with current pricing?', body: 'Selections are kept where the items still exist. Prices update to the current configuration.', confirmLabel: 'Reprice' }))) return;
    config = state.pricing;
    q.pricingVersionId = config.id;
    const valid = new Set(config.sections.flatMap((s) => s.items.map((it) => it.id)));
    for (const k of Object.keys(q.selections)) if (!valid.has(k)) delete q.selections[k];
    $('[data-notes]').innerHTML = String(html`${versionNote()}${sentNote()}`);
    changed({ items: true });
    toast('Repriced with current pricing.');
  }

  function newClientDrawer() {
    drawer({
      title: 'New client',
      submitLabel: 'Create client',
      body: html`<div class="grid">
        ${f.text('company', 'Company', '', { placeholder: 'Khumalo Projects (Pty) Ltd' })}
        ${f.text('contactName', 'Contact name', '', { placeholder: 'Thandiwe Khumalo' })}
        <div class="grid g2">${f.text('email', 'Email', '', { type: 'email', placeholder: 'thandiwe@khumaloprojects.co.za' })}${f.text('phone', 'Phone', '', { type: 'tel', placeholder: '+27 82 555 0143' })}</div>
        ${f.textarea('address', 'Address', '', { rows: 3, placeholder: '14 Meridian Drive\nUmhlanga Ridge\n4319' })}
        ${f.text('vatNumber', 'VAT number', '', { placeholder: '4123456789' })}
      </div>`,
      onSubmit: async (form) => {
        const v = f.readForm(form);
        if (!v.company && !v.contactName) { toast('Enter a company or contact name.', { error: true }); return false; }
        try {
          const cid = await create('clients', { ...v, website: '', notes: '', tags: [], sourceId: null, custom: {} });
          await logClient(cid, 'created', 'Created from the quote builder');
          q.clientId = cid;
          q.clientSnapshot = clientSnapshot(v);
          setTimeout(drawClient, 100);
          changed({ reprice: false });
          toast('Client created.');
        } catch (err) { toastError(err); return false; }
        return true;
      },
    });
  }

  // ---------- go ----------

  drawHeader();
  drawClient();
  drawItems();
  drawScope();
  drawTimeline();
  drawPayment();
  drawTerms();
  drawInternal();
  drawSummary();
  drawActivity();

  view.watch(['clients'], () => { if (!view.el.querySelector('[name="clientId"]:focus')) drawClient(); });
  view.watch(['quotes'], () => {
    if (!id || dirty || saving) return;
    const fresh = state.quotes.get(id);
    if (fresh && fresh.status !== q.status) { q = clone(fresh); drawHeader(); }
  });
}

function activityText(a) {
  const map = { created: 'Created', edited: 'Edited', status: 'Status', revision: 'Revision', duplicated: 'Duplicated', saved: 'Saved to files' };
  if (a.type === 'status' && a.detail) return `Status: ${a.detail}`;
  return a.detail || map[a.type] || a.type;
}

