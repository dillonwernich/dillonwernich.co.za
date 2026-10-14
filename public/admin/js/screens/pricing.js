import { html, attr } from '../lib/html.js';
import { money, centsToInput, parseMoney, dateTime, date, percent } from '../lib/format.js';
import { state, lib, savePricingVersion, listVersions, getVersion, quotesUsingItem, saveSetting } from '../data/store.js';
import { KINDS, kindOf, hasOptions, cents, compute, defaultSelections, milestoneAmounts } from '../pricing/engine.js';
import { renderQuoteDoc } from '../doc/render.js';
import { seedPricing } from '../data/seed.js';
import { icon } from '../ui/icons.js';
import { kebab } from '../ui/blocks.js';
import { drawer, modal, menu, confirm } from '../ui/overlay.js';
import { sortable } from '../ui/sortable.js';
import * as f from '../ui/fields.js';
import { toast, toastError } from '../ui/toast.js';
import { setMeta } from '../shell.js';
import { clone, uid, move, byOrder } from '../lib/util.js';

const kindLabel = (k) => KINDS.find((x) => x.value === k)?.label || k;

function working(version) {
  const c = clone(version);
  delete c.id; delete c.number; delete c.createdAt;
  c.sections = (c.sections || []).sort(byOrder).map((s) => ({ ...s, items: (s.items || []).sort(byOrder) }));
  return c;
}

export default function pricing(view) {
  let cfg = working(state.pricing);
  let base = state.pricing;
  let dirty = false;
  view.guard(() => dirty);

  const touch = () => {
    dirty = true;
    drawMeta();
    drawPreview();
  };

  const drawMeta = () => setMeta(html`<span class="save-state${dirty ? ' dirty' : ''}">${dirty ? 'Unsaved changes' : `Version ${base.number} · ${date(base.createdAt)}`}</span>`);

  view.header({
    title: 'Pricing',
    actions: html`<button type="button" class="btn btn-ghost hide-sm" data-act="history">History</button>
      <button type="button" class="btn btn-ghost hide-sm" data-act="reset-defaults">Reset to defaults</button>
      <button type="button" class="btn hide-sm" data-act="add-section">${icon('plus')}Section</button>
      <button type="button" class="btn btn-primary" data-act="save">Save version</button>`,
  });
  drawMeta();

  view.el.innerHTML = String(html`
    <div class="pricing-layout">
      <div>
        <section class="panel section-block">
          <div class="panel-head"><h2>Settings</h2><div class="btn-row"><button type="button" class="btn btn-sm" data-act="edit-core">${icon('edit')}Edit</button></div></div>
          <div class="panel-body" data-core></div>
        </section>
        <div data-sections></div>
        <div class="btn-row show-sm"><button type="button" class="btn" data-act="add-section">${icon('plus')}Add section</button>
          <button type="button" class="btn" data-act="reset-defaults">Reset to defaults</button></div>
      </div>
      <aside class="pricing-preview">
        <div class="panel">
          <div class="panel-head"><h2>Preview quote</h2></div>
          <div class="panel-body"><div class="preview-doc-wrap" data-preview></div><p class="faint preview-note">Sample quote using each item's default selection.</p></div>
        </div>
      </aside>
    </div>`);

  const $ = (s) => view.el.querySelector(s);
  const findSection = (sid) => cfg.sections.find((s) => s.id === sid);
  const findItem = (sid, iid) => findSection(sid)?.items.find((i) => i.id === iid);
  const amount = (price) => cents(price, cfg.core);
  const quantityItems = () => cfg.sections.flatMap((s) => s.items).filter((x) => kindOf(x) === 'quantity');

  // ---------- drawing ----------

  const drawCore = () => {
    const c = cfg.core;
    const qd = state.settings.quoteDefaults || {};
    $('[data-core]').innerHTML = String(html`<dl class="kv">
      <dt>VAT</dt><dd>${c.vatRegistered ? `Registered · ${percent(c.vatRate)}` : 'Not registered. Quotes show no VAT and say so.'}</dd>
      <dt>Validity</dt><dd>${qd.validityDays || 30} days</dd>
      <dt>Currency</dt><dd>${c.currency || 'ZAR'} · ${c.locale || 'en-ZA'}</dd>
    </dl>`);
  };

  const priceSummary = (it) => {
    const kind = kindOf(it);
    if (kind === 'percentage') return percent(it.percent);
    if (kind === 'quantity') return `${money(amount(it.price))} per ${it.unit || 'unit'}`;
    if (hasOptions(kind) && it.options.length) {
      const amounts = it.options.map((o) => amount(o.price));
      const lo = Math.min(...amounts);
      const hi = Math.max(...amounts);
      return lo === hi ? money(lo) : `${money(lo)} to ${money(hi)}`;
    }
    return money(amount(it.price));
  };

  const drawSections = () => {
    const box = $('[data-sections]');
    if (!cfg.sections.length) {
      box.innerHTML = String(html`<div class="panel section-block"><div class="empty"><p>There are no pricing sections.</p>
        <button type="button" class="btn" data-act="reset-defaults">Reset to defaults</button></div></div>`);
      return;
    }
    box.innerHTML = String(html`${cfg.sections.map((s) => html`
      <section class="section-block" data-sort-id="${s.id}">
        <div class="section-head">
          <span class="handle" data-handle aria-label="Drag to reorder section">${icon('grip')}</span>
          <div class="section-title">${s.name}${s.visible === false ? html` <span class="badge">Hidden</span>` : ''}
            ${s.description ? html`<div class="desc">${s.description}</div>` : ''}</div>
          <button type="button" class="btn btn-sm" data-act="add-item" data-s="${s.id}">${icon('plus')}Item</button>
          ${kebab('section-menu', s.id, 'Section actions')}
        </div>
        <div class="table-wrap">
          ${s.items.length ? html`<table class="table"><tbody data-items="${s.id}">${s.items.map((it) => html`
            <tr data-sort-id="${it.id}" class="${it.visible === false ? 'is-hidden' : ''}">
              <td class="td-handle"><span class="handle" data-handle aria-label="Drag to reorder">${icon('grip')}</span></td>
              <td class="link" data-act="edit-item" data-s="${s.id}" data-i="${it.id}">
                <div class="primary">${it.label}</div>
                <div class="sub">${kindLabel(kindOf(it))}${it.options?.length ? ` · ${it.options.length} options` : ''}<span class="hide-sm">${it.clientDescription ? ` · ${it.clientDescription}` : ''}</span><span class="show-sm"> · ${priceSummary(it)}</span></div>
              </td>
              <td class="col-opt">${it.recurring ? html`<span class="badge">Monthly</span> ` : ''}${it.visible === false ? html`<span class="badge">Hidden</span> ` : ''}${it.showOnQuote === false ? html`<span class="badge">Not on quote</span>` : ''}</td>
              <td class="num hide-sm">${priceSummary(it)}</td>
              <td class="actions">${kebab('item-menu', `${s.id}|${it.id}`, 'Item actions')}</td>
            </tr>`)}</tbody></table>`
            : html`<div class="empty"><p>No items in this section.</p><button type="button" class="btn" data-act="add-item" data-s="${s.id}">${icon('plus')}Add item</button></div>`}
        </div>
      </section>`)}`);

    box.querySelectorAll('[data-items]').forEach((tbody) => sortable(tbody, {
      onReorder: (iid, to) => {
        const s = findSection(tbody.dataset.items);
        const from = s.items.findIndex((i) => i.id === iid);
        s.items = move(s.items, from, to);
        touch();
        drawSections();
      },
    }));
  };

  const drawPreview = () => {
    const sel = defaultSelections(cfg);
    const result = compute(cfg, sel);
    const qd = state.settings.quoteDefaults || {};
    const tpl = lib('paymentTemplates').find((t) => t.id === qd.defaultPaymentTemplateId) || lib('paymentTemplates')[0];
    const sample = {
      number: 'DW-0000-0000',
      title: 'Website for Mthembu Attorneys',
      summary: 'A clear, fast website that explains the practice areas and makes it easy to book a consultation.',
      issueDate: new Date(),
      validUntil: new Date(Date.now() + (qd.validityDays || 30) * 86400000),
      clientSnapshot: { company: 'Mthembu Attorneys Inc.', contactName: 'Nomsa Mthembu', email: 'nomsa@mthembuattorneys.co.za', address: '3 Palm Boulevard\nUmhlanga Ridge\n4319' },
      lines: result.lines, adjustments: result.adjustments, totals: result.totals,
      timeline: { note: '3 to 4 weeks from the deposit' },
      payment: { milestones: milestoneAmounts(tpl?.milestones || [], result.totals.total) },
      scope: { included: lib('scopeTemplates').filter((s) => s.kind === 'included' && s.defaultOn).map((s) => s.text) },
      terms: lib('terms').filter((t) => t.defaultOn).slice(0, 3),
    };
    const wrap = $('[data-preview]');
    wrap.innerHTML = String(html`<div class="preview-doc">${renderQuoteDoc(sample, state.settings.business || {})}</div>`);
    const doc = wrap.querySelector('.qdoc');
    const scale = wrap.clientWidth / doc.offsetWidth;
    wrap.style.setProperty('--scale', String(scale));
    wrap.style.height = `${doc.offsetHeight * scale}px`;
  };

  // ---------- editors ----------

  function coreDrawer() {
    const c = cfg.core;
    const qd = state.settings.quoteDefaults || {};
    drawer({
      title: 'Settings',
      submitLabel: 'Apply',
      body: html`<div class="stack">
        ${f.check('vatRegistered', 'Registered for VAT', c.vatRegistered)}
        <div class="grid g2">
          ${f.number('vatRate', 'VAT rate', c.vatRate, { suffix: '%', min: 0 })}
          ${f.number('validityDays', 'Quote validity', qd.validityDays || 30, { suffix: 'days', min: 1, step: 1 })}
          ${f.text('currency', 'Currency', c.currency || 'ZAR')}
          ${f.text('locale', 'Locale', c.locale || 'en-ZA')}
        </div>
      </div>`,
      onSubmit: async (form) => {
        const v = f.readForm(form);
        cfg.core = {
          currency: v.currency || 'ZAR',
          locale: v.locale || 'en-ZA',
          vatRegistered: v.vatRegistered,
          vatRate: Number(v.vatRate) || 0,
        };
        if (Number(v.validityDays) !== Number(qd.validityDays)) {
          try { await saveSetting('quoteDefaults', { validityDays: Math.max(1, Number(v.validityDays) || 30) }); } catch (e) { toastError(e); }
        }
        touch();
        drawCore();
        drawSections();
      },
    });
  }

  function sectionDrawer(section = null) {
    const s = section || { id: uid(8), name: '', description: '', visible: true, items: [] };
    drawer({
      title: section ? 'Edit section' : 'New section',
      submitLabel: section ? 'Apply' : 'Add section',
      body: html`<div class="grid">
        ${f.text('name', 'Name', s.name)}
        ${f.textarea('description', 'Description', s.description, { rows: 2, hint: 'shown to you only' })}
        ${f.check('visible', 'Visible in the quote builder', s.visible !== false)}
      </div>`,
      onSubmit: (form) => {
        const v = f.readForm(form);
        if (!v.name) { toast('Enter a section name.', { error: true }); return false; }
        Object.assign(s, { name: v.name, description: v.description, visible: v.visible });
        if (!section) cfg.sections.push(s);
        touch();
        drawSections();
        return true;
      },
    });
  }

  const optionRow = (o, itemId) => {
    const incItem = Object.keys(o.includes || {})[0] || '';
    const incQty = Object.values(o.includes || {})[0] ?? '';
    return html`
    <div class="opt-card" data-opt="${o.id}" data-sort-id="${o.id}">
      <div class="opt-main">
        <span class="handle" data-handle>${icon('grip')}</span>
        <input class="input" data-f="label" value="${o.label}" aria-label="Option name">
        <div class="affix"><span class="pre">R</span><input class="input num" data-f="price" inputmode="decimal" value="${centsToInput(amount(o.price))}" aria-label="Price"></div>
        <button type="button" class="icon-btn" data-remove-opt aria-label="Remove option">${icon('x')}</button>
      </div>
      <details class="opt-more">
        <summary>More</summary>
        <div class="grid g2">
          <div class="field span2"><span class="label">Description on the quote</span><input class="input" data-f="clientDescription" value="${o.clientDescription || ''}"></div>
          <div class="field span2"><span class="label">Includes <span class="hint">free units of a per-unit item, e.g. pages</span></span>
            <div class="price-input">
              <select class="select" data-f="includesItem"><option value="">Nothing</option>${quantityItems().filter((x) => x.id !== itemId).map((x) => html`<option value="${x.id}"${attr(incItem === x.id, 'selected')}>${x.label}</option>`)}</select>
              <input class="input num" data-f="includesQty" type="number" min="0" step="1" value="${incQty}" placeholder="0">
            </div></div>
          <label class="check"><input type="checkbox" data-f="visible"${attr(o.visible !== false, 'checked')}><span>Visible</span></label>
        </div>
      </details>
    </div>`;
  };

  function itemDrawer(sectionId, item = null) {
    const section = findSection(sectionId);
    const it = item ? clone(item) : {
      id: uid(8), label: '', kind: 'toggle', clientDescription: '', price: 0,
      options: [], percent: 0, unit: '', includedQty: 0, recurring: false, visible: true, showOnQuote: true, default: null,
    };
    it.kind = kindOf(it);
    const used = item ? quotesUsingItem(item.id) : [];

    drawer({
      title: item ? `Edit ${item.label}` : 'New item',
      submitLabel: item ? 'Apply' : 'Add item',
      body: html`<div class="stack">
        ${used.length ? html`<div class="notice info">${icon('quotes')}<div>Used by ${used.length} ${used.length === 1 ? 'quote' : 'quotes'}. Saved quotes keep the version they were priced with.</div></div>` : ''}
        <div class="grid g2">
          ${f.text('label', 'Label', it.label)}
          ${f.select('kind', 'Kind', it.kind, KINDS)}
          ${f.textarea('clientDescription', 'Description on the quote', it.clientDescription, { rows: 2, cls: 'span2' })}
        </div>

        <div data-show="toggle">${f.moneyField('price', 'Price', amount(it.price))}</div>

        <div class="grid g2" data-show="quantity">
          ${f.moneyField('unitPrice', 'Price per unit', amount(it.price))}
          ${f.text('unit', 'Unit', it.unit, { hint: 'singular, e.g. page' })}
          ${f.number('includedQty', 'Always included', it.includedQty, { min: 0, step: 1, hint: 'units not charged for' })}
        </div>

        <div class="stack-sm" data-show="single-select multi-select">
          <div class="btn-row"><div class="section-title grow">Options</div><button type="button" class="btn btn-sm" data-add-opt>${icon('plus')}Option</button></div>
          <div class="opt-list" data-opts>${it.options.map((o) => optionRow(o, it.id))}</div>
        </div>

        <div data-show="percentage">${f.number('percent', 'Percentage', it.percent, { suffix: '%', hint: 'negative for a discount', step: 0.5 })}</div>

        <div class="grid g2">
          <div class="field" data-show="single-select"><label class="label" for="f-default">Default</label>
            <select class="select" id="f-default" name="default"><option value="">None</option>${it.options.map((o) => html`<option value="${o.id}"${attr(it.default === o.id, 'selected')}>${o.label}</option>`)}</select></div>
          <div data-show="toggle">${f.check('defaultOn', 'On by default', it.default === true)}</div>
        </div>
        <div class="stack-sm">
          ${f.check('recurring', 'Billed monthly', it.recurring, { hint: 'totalled separately on the quote' })}
          ${f.check('showOnQuote', 'Show on the quote', it.showOnQuote !== false)}
          ${f.check('visible', 'Visible in the quote builder', it.visible !== false)}
        </div>
      </div>`,
      onOpen: (form) => {
        const syncKind = () => {
          const k = form.querySelector('[name="kind"]').value;
          form.querySelectorAll('[data-show]').forEach((n) => { n.hidden = !n.dataset.show.split(' ').includes(k); });
        };
        form.querySelector('[name="kind"]').addEventListener('change', syncKind);
        syncKind();
        sortable(form.querySelector('[data-opts]'), {
          itemSelector: '.opt-card',
          onReorder: (oid, to) => {
            const list = form.querySelector('[data-opts]');
            const nodes = [...list.children];
            const node = nodes.find((n) => n.dataset.opt === oid);
            node.remove();
            const rest = [...list.children];
            if (to >= rest.length) list.append(node); else list.insertBefore(node, rest[to]);
          },
        });

        form.addEventListener('click', (e) => {
          if (e.target.closest('[data-add-opt]')) {
            const o = { id: uid(8), label: '', price: 0, clientDescription: '', includes: {}, visible: true };
            const list = form.querySelector('[data-opts]');
            list.insertAdjacentHTML('beforeend', String(optionRow(o, it.id)));
            list.lastElementChild.querySelector('input').focus();
          }
          const rm = e.target.closest('[data-remove-opt]');
          if (rm) {
            const card = rm.closest('.opt-card');
            const using = item ? quotesUsingItem(item.id, card.dataset.opt) : [];
            if (using.length) {
              blocked(`This option is used by ${using.length} ${using.length === 1 ? 'quote' : 'quotes'}`, using, 'Untick Visible under More to hide it instead.');
              return;
            }
            card.remove();
          }
        });
      },
      onSubmit: (form) => {
        const v = f.readForm(form);
        if (!v.label) { toast('Enter a label.', { error: true }); return false; }
        const options = hasOptions(v.kind) && v.kind !== 'quantity' ? [...form.querySelectorAll('.opt-card')].map((card) => {
          const g = (n) => card.querySelector(`[data-f="${n}"]`);
          const incItem = g('includesItem').value;
          const incQty = Number(g('includesQty').value) || 0;
          return {
            id: card.dataset.opt,
            label: g('label').value.trim() || 'Untitled option',
            price: parseMoney(g('price').value),
            clientDescription: g('clientDescription').value.trim(),
            includes: incItem && incQty ? { [incItem]: incQty } : {},
            visible: g('visible').checked,
          };
        }) : [];
        if (hasOptions(v.kind) && v.kind !== 'quantity' && !options.length) { toast('Add at least one option.', { error: true }); return false; }

        let def = null;
        if (v.kind === 'single-select') def = v.default && options.some((o) => o.id === v.default) ? v.default : null;
        else if (v.kind === 'toggle') def = v.defaultOn ? true : null;
        else if (v.kind === 'multi-select') def = Array.isArray(it.default) ? it.default.filter((x) => options.some((o) => o.id === x)) : null;

        const next = {
          id: it.id, label: v.label, kind: v.kind, clientDescription: v.clientDescription,
          price: v.kind === 'quantity' ? parseMoney(v.unitPrice) : parseMoney(v.price),
          options, percent: Number(v.percent) || 0,
          unit: v.unit, includedQty: Number(v.includedQty) || 0,
          recurring: v.recurring, showOnQuote: v.showOnQuote, visible: v.visible, default: def,
        };
        if (item) section.items[section.items.findIndex((x) => x.id === item.id)] = next;
        else section.items.push(next);
        touch();
        drawSections();
        return true;
      },
    });
  }

  function blocked(title, quotes, hint) {
    const m = modal({
      label: title,
      body: html`<div class="modal-body"><h2>${title}</h2><p>${hint}</p>
        <ul class="timeline modal-list">${quotes.slice(0, 12).map((q) => html`<li><time>${q.number || 'Draft'}</time><div><a href="/admin/quotes/${q.id}/">${q.title || 'Untitled quote'}</a></div></li>`)}</ul>
        ${quotes.length > 12 ? html`<p class="faint">And ${quotes.length - 12} more.</p>` : ''}</div>`,
      foot: html`<button type="button" class="btn btn-primary" data-ok>OK</button>`,
    });
    m.node.querySelector('[data-ok]').addEventListener('click', () => m.close());
    m.node.addEventListener('click', (e) => { if (e.target.closest('a')) m.close(); });
  }

  async function deleteItem(s, it) {
    const used = quotesUsingItem(it.id);
    if (used.length) { blocked(`${it.label} is used by ${used.length} ${used.length === 1 ? 'quote' : 'quotes'}`, used, 'Hide it instead. Hidden items stay on existing quotes but no longer appear in the builder.'); return; }
    if (!(await confirm({ title: `Delete ${it.label}?`, body: 'It is removed from the next version you save.', confirmLabel: 'Delete', danger: true }))) return;
    const index = s.items.indexOf(it);
    s.items.splice(index, 1);
    touch();
    drawSections();
    toast('Item deleted.', { undo: () => { s.items.splice(index, 0, it); touch(); drawSections(); } });
  }

  async function deleteSection(s) {
    const used = s.items.flatMap((it) => quotesUsingItem(it.id));
    const unique = [...new Map(used.map((q) => [q.id, q])).values()];
    if (unique.length) { blocked(`${s.name} has items used by ${unique.length} ${unique.length === 1 ? 'quote' : 'quotes'}`, unique, 'Hide the section instead.'); return; }
    if (!(await confirm({ title: `Delete ${s.name}?`, body: `Its ${s.items.length} items are removed too.`, confirmLabel: 'Delete', danger: true }))) return;
    const index = cfg.sections.indexOf(s);
    cfg.sections.splice(index, 1);
    touch();
    drawSections();
    toast('Section deleted.', { undo: () => { cfg.sections.splice(index, 0, s); touch(); drawSections(); } });
  }

  // Replaces every section with the defaults. Quotes keep the version they were priced
  // with, so nothing already sent changes.
  async function resetDefaults() {
    if (!(await confirm({ title: 'Reset to the default pricing?', body: 'Every section and item on screen is replaced. Nothing is saved until you save a version.', confirmLabel: 'Reset', danger: true }))) return;
    const previous = cfg.sections;
    cfg.sections = seedPricing().sections;
    touch();
    drawSections();
    toast('Reset to the default pricing. Save version to keep it.', { undo: () => { cfg.sections = previous; touch(); drawSections(); } });
  }

  async function history() {
    let versions = [];
    try { versions = await listVersions(30); } catch (e) { toastError(e); return; }
    const m = modal({
      wide: true,
      label: 'Pricing history',
      body: html`<div class="modal-body"><h2>Pricing history</h2><p>Every save is a version. Quotes keep the version they were priced with.</p></div>
        <table class="table"><tbody>${versions.map((v) => html`<tr>
          <td class="mono">v${v.number}</td><td><div class="primary">${v.note || 'No note'}</div><div class="sub">${dateTime(v.createdAt)} · ${(v.sections || []).reduce((n, s) => n + (s.items || []).length, 0)} items</div></td>
          <td class="actions">${v.id === state.pricing.id ? html`<span class="badge role-sent">Current</span>` : html`<button type="button" class="btn btn-sm" data-restore="${v.id}">Load</button>`}</td></tr>`)}</tbody></table>`,
      foot: html`<button type="button" class="btn" data-close>Close</button>`,
    });
    m.node.querySelector('[data-close]').addEventListener('click', () => m.close());
    m.node.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-restore]');
      if (!b) return;
      if (dirty && !(await confirm({ title: 'Discard unsaved changes?', body: 'Loading an older version replaces what is on screen.', confirmLabel: 'Load', danger: true }))) return;
      const v = await getVersion(b.dataset.restore);
      cfg = working(v);
      m.close();
      touch();
      drawCore();
      drawSections();
      toast(`Loaded version ${v.number}. Save to make it current.`);
    });
  }

  function saveDialog() {
    drawer({
      title: 'Save pricing version',
      submitLabel: 'Save version',
      guard: false,
      body: html`<div class="stack"><p class="muted">Saving creates version ${(state.settings.pricing?.latestNumber || base.number) + 1}. New quotes use it; existing quotes keep theirs until you reprice them.</p>
        ${f.text('note', 'Note', '', { placeholder: 'Raised feature prices' })}</div>`,
      onSubmit: async (form) => {
        const { note } = f.readForm(form);
        try {
          const sections = cfg.sections.map((s, si) => ({ ...s, order: si, items: s.items.map((it, ii) => ({ ...it, order: ii })) }));
          const newId = await savePricingVersion({ ...cfg, sections, note });
          base = await getVersion(newId);
          cfg = working(base);
          dirty = false;
          drawMeta();
          drawSections();
          toast(`Saved as version ${base.number}.`);
        } catch (e) { toastError(e, 'Could not save the pricing version.'); return false; }
        return true;
      },
    });
  }

  // ---------- events ----------

  view.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act], [data-action]');
    if (!b) return;
    const act = b.dataset.act || b.dataset.action;
    if (act === 'edit-core') coreDrawer();
    if (act === 'reset-defaults') resetDefaults();
    if (act === 'add-section') sectionDrawer();
    if (act === 'add-item') itemDrawer(b.dataset.s);
    if (act === 'edit-item') itemDrawer(b.dataset.s, findItem(b.dataset.s, b.dataset.i));
    if (act === 'section-menu') {
      e.stopPropagation();
      const s = findSection(b.dataset.id);
      menu(b, [
        { label: 'Edit section', icon: 'edit', onSelect: () => sectionDrawer(s) },
        { label: 'Duplicate', icon: 'copy', onSelect: () => {
          const copy = clone(s);
          copy.id = uid(8);
          copy.name = `${s.name} copy`;
          copy.items = copy.items.map((it) => ({ ...it, id: uid(8) }));
          cfg.sections.splice(cfg.sections.indexOf(s) + 1, 0, copy);
          touch(); drawSections();
        } },
        { label: s.visible === false ? 'Show' : 'Hide', icon: s.visible === false ? 'eye' : 'eyeOff', onSelect: () => { s.visible = s.visible === false; touch(); drawSections(); } },
        'sep',
        { label: 'Delete', icon: 'trash', danger: true, onSelect: () => deleteSection(s) },
      ]);
    }
    if (act === 'item-menu') {
      e.stopPropagation();
      const [sid, iid] = b.dataset.id.split('|');
      const s = findSection(sid);
      const it = findItem(sid, iid);
      menu(b, [
        { label: 'Edit', icon: 'edit', onSelect: () => itemDrawer(sid, it) },
        { label: 'Duplicate', icon: 'copy', onSelect: () => {
          const copy = { ...clone(it), id: uid(8), label: `${it.label} copy` };
          s.items.splice(s.items.indexOf(it) + 1, 0, copy);
          touch(); drawSections();
        } },
        { label: it.visible === false ? 'Show' : 'Hide', icon: it.visible === false ? 'eye' : 'eyeOff', onSelect: () => { it.visible = it.visible === false; touch(); drawSections(); } },
        'sep',
        { label: 'Delete', icon: 'trash', danger: true, onSelect: () => deleteItem(s, it) },
      ]);
    }
  });

  const headerEl = document.querySelector('[data-actions]');
  const onHeader = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'save') { if (!dirty) { toast('No changes to save.'); return; } saveDialog(); }
    if (b.dataset.act === 'history') history();
    if (b.dataset.act === 'reset-defaults') resetDefaults();
    if (b.dataset.act === 'add-section') sectionDrawer();
  };
  headerEl.addEventListener('click', onHeader);
  view.onCleanup(() => headerEl.removeEventListener('click', onHeader));

  const onResize = () => drawPreview();
  addEventListener('resize', onResize);
  view.onCleanup(() => removeEventListener('resize', onResize));

  // The sections container persists across redraws, so it is made sortable once.
  sortable($('[data-sections]'), {
    onReorder: (sid, to) => {
      const from = cfg.sections.findIndex((s) => s.id === sid);
      cfg.sections = move(cfg.sections, from, to);
      touch();
      drawSections();
    },
  });

  drawCore();
  drawSections();
  drawPreview();
  view.watch(['settings.quoteDefaults', 'settings.business'], () => { drawCore(); drawPreview(); });
}
