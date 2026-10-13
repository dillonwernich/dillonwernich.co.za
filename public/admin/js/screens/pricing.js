import { html, attr } from '../lib/html.js';
import { money, centsToInput, parseMoney, dateTime, date, percent } from '../lib/format.js';
import { state, lib, savePricingVersion, listVersions, getVersion, quotesUsingItem, saveSetting } from '../data/store.js';
import { KINDS, hasOptions, describePrice, compute, defaultSelections, milestoneAmounts } from '../pricing/engine.js';
import { renderQuoteDoc } from '../doc/render.js';
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
      <button type="button" class="btn hide-sm" data-act="add-section">${icon('plus')}Section</button>
      <button type="button" class="btn btn-primary" data-act="save">Save version</button>`,
  });
  drawMeta();

  view.el.innerHTML = String(html`
    <div class="pricing-layout">
      <div>
        <div data-placeholder></div>
        <section class="panel section-block">
          <div class="panel-head"><h2>Core settings</h2><div class="btn-row"><button type="button" class="btn btn-sm" data-act="edit-core">${icon('edit')}Edit</button></div></div>
          <div class="panel-body" data-core></div>
        </section>
        <div data-sections></div>
        <button type="button" class="btn show-sm" data-act="add-section">${icon('plus')}Add section</button>
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
  const fmt = (p) => describePrice(p, cfg.core.hourlyRate, money);

  // ---------- drawing ----------

  const drawPlaceholder = () => {
    const n = cfg.sections.flatMap((s) => s.items).filter((i) => i.placeholder).length;
    $('[data-placeholder]').innerHTML = String(n
      ? html`<div class="notice">${icon('pricing')}<div>${n} ${n === 1 ? 'item still has a placeholder price' : 'items still have placeholder prices'}. Everything here is editable: open an item, set its price and untick Placeholder.</div></div>`
      : '');
  };

  const drawCore = () => {
    const c = cfg.core;
    const qd = state.settings.quoteDefaults || {};
    $('[data-core]').innerHTML = String(html`<dl class="kv">
      <dt>Hourly rate</dt><dd class="num">${money(c.hourlyRate)}</dd>
      <dt>Currency</dt><dd>${c.currency || 'ZAR'} · ${c.locale || 'en-ZA'}</dd>
      <dt>VAT</dt><dd>${c.vatRegistered ? `Registered · ${percent(c.vatRate)}` : 'Not registered. Quotes show no VAT and say so.'}</dd>
      <dt>Minimum fee</dt><dd class="num">${money(c.minimumFee)}</dd>
      <dt>Validity</dt><dd>${qd.validityDays || 30} days</dd>
    </dl>`);
  };

  const priceSummary = (it) => {
    if (it.kind === 'percentage') return percent(it.percent);
    if (it.kind === 'multiplier') return it.options.map((o) => `× ${o.multiplier ?? 1}`).join(' / ');
    if (it.kind === 'quantity' && it.bands?.length) return `${it.bands.length} bands, ${it.bandMode === 'flat' ? 'flat' : 'tiered'}`;
    if (hasOptions(it.kind) && it.options.length) {
      const amounts = it.options.map((o) => (o.price?.mode === 'hours' ? o.price.amount * cfg.core.hourlyRate : o.price?.amount || 0));
      const lo = Math.min(...amounts);
      const hi = Math.max(...amounts);
      return lo === hi ? money(lo) : `${money(lo)} to ${money(hi)}`;
    }
    return fmt(it.price);
  };

  const drawSections = () => {
    const box = $('[data-sections]');
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
                <div class="sub">${kindLabel(it.kind)}${it.options?.length ? ` · ${it.options.length} options` : ''}<span class="hide-sm">${it.clientDescription ? ` · ${it.clientDescription}` : ''}</span><span class="show-sm"> · ${priceSummary(it)}</span></div>
              </td>
              <td class="col-opt">${it.placeholder ? html`<span class="badge warn">Placeholder</span> ` : ''}${it.recurring ? html`<span class="badge">Monthly</span> ` : ''}${it.visible === false ? html`<span class="badge">Hidden</span> ` : ''}${it.showOnQuote === false ? html`<span class="badge">Not on quote</span>` : ''}</td>
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
    drawPlaceholder();
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
      timeline: { weeks: Math.max(1, Math.ceil(result.totals.hours / (qd.hoursPerWeek || 20))) },
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
      title: 'Core settings',
      submitLabel: 'Apply',
      body: html`<div class="stack">
        <div class="grid g2">
          ${f.moneyField('hourlyRate', 'Hourly rate', c.hourlyRate, { hint: 'reprices everything in hours' })}
          ${f.moneyField('minimumFee', 'Minimum project fee', c.minimumFee, { hint: 'after discounts' })}
          ${f.text('currency', 'Currency', c.currency || 'ZAR')}
          ${f.text('locale', 'Locale', c.locale || 'en-ZA')}
        </div>
        ${f.check('vatRegistered', 'Registered for VAT', c.vatRegistered)}
        <div class="grid g2">
          ${f.number('vatRate', 'VAT rate', c.vatRate, { suffix: '%', min: 0 })}
          ${f.number('validityDays', 'Quote validity', qd.validityDays || 30, { suffix: 'days', min: 1, step: 1 })}
        </div>
      </div>`,
      onSubmit: async (form) => {
        const v = f.readForm(form);
        cfg.core = {
          ...c,
          hourlyRate: parseMoney(v.hourlyRate),
          minimumFee: parseMoney(v.minimumFee),
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
        ${f.text('name', 'Name', s.name, { placeholder: 'Integrations' })}
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

  const priceInput = (prefix, price = { mode: 'fixed', amount: 0 }, label = 'Price') => html`
    <div class="field"><span class="label">${label}</span>
      <div class="price-input">
        <select class="select" name="${prefix}.mode" aria-label="${label} mode">
          <option value="fixed"${attr(price.mode !== 'hours', 'selected')}>Rand</option>
          <option value="hours"${attr(price.mode === 'hours', 'selected')}>Hours</option>
        </select>
        <input class="input num" name="${prefix}.amount" inputmode="decimal" value="${price.mode === 'hours' ? price.amount : centsToInput(price.amount)}" aria-label="${label} amount">
      </div>
    </div>`;

  const readPrice = (form, prefix) => {
    const mode = form.querySelector(`[name="${prefix}.mode"]`)?.value || 'fixed';
    const raw = form.querySelector(`[name="${prefix}.amount"]`)?.value || '0';
    return mode === 'hours' ? { mode, amount: Number(String(raw).replace(',', '.')) || 0 } : { mode, amount: parseMoney(raw) };
  };

  const optionRow = (o, itemId) => html`
    <div class="opt-card" data-opt="${o.id}" data-sort-id="${o.id}">
      <div class="opt-main">
        <span class="handle" data-handle>${icon('grip')}</span>
        <input class="input" data-f="label" value="${o.label}" placeholder="Option name" aria-label="Option name">
        <select class="select" data-f="mode" aria-label="Price mode"><option value="fixed"${attr(o.price?.mode !== 'hours', 'selected')}>R</option><option value="hours"${attr(o.price?.mode === 'hours', 'selected')}>h</option></select>
        <input class="input num" data-f="amount" inputmode="decimal" value="${o.price?.mode === 'hours' ? o.price.amount : centsToInput(o.price?.amount || 0)}" aria-label="Amount">
        <button type="button" class="icon-btn" data-remove-opt aria-label="Remove option">${icon('x')}</button>
      </div>
      <details class="opt-more">
        <summary>More</summary>
        <div class="grid g2">
          <div class="field span2"><span class="label">Client description</span><input class="input" data-f="clientDescription" value="${o.clientDescription || ''}"></div>
          <div class="field" data-show="multiplier single-select"><span class="label">Multiplier</span><input class="input num" data-f="multiplier" type="number" step="0.01" value="${o.multiplier ?? ''}" placeholder="none"></div>
          <div class="field"><span class="label">Complexity weight</span><input class="input num" data-f="weight" type="number" step="0.5" value="${o.weight ?? 1}"></div>
          <div class="field span2"><span class="label">Includes <span class="hint">free units of a quantity item, e.g. pages</span></span>
            <div class="price-input">
              <select class="select" data-f="includesItem"><option value="">Nothing</option>${cfg.sections.flatMap((s) => s.items).filter((x) => x.kind === 'quantity' && x.id !== itemId).map((x) => html`<option value="${x.id}"${attr(Object.keys(o.includes || {})[0] === x.id, 'selected')}>${x.label}</option>`)}</select>
              <input class="input num" data-f="includesQty" type="number" min="0" step="1" value="${Object.values(o.includes || {})[0] ?? ''}" placeholder="0">
            </div></div>
          <label class="check"><input type="checkbox" data-f="visible"${attr(o.visible !== false, 'checked')}><span>Visible</span></label>
        </div>
      </details>
    </div>`;

  const bandRow = (b) => html`<div class="band-row" data-band>
    <div class="affix"><span class="pre">up to</span><input class="input num" data-f="upTo" type="number" min="1" step="1" value="${b.upTo ?? ''}" placeholder="no limit"></div>
    <select class="select" data-f="mode"><option value="fixed"${attr(b.price?.mode !== 'hours', 'selected')}>R</option><option value="hours"${attr(b.price?.mode === 'hours', 'selected')}>h</option></select>
    <input class="input num" data-f="amount" inputmode="decimal" value="${b.price?.mode === 'hours' ? b.price.amount : centsToInput(b.price?.amount || 0)}">
    <button type="button" class="icon-btn" data-remove-band aria-label="Remove band">${icon('x')}</button>
  </div>`;

  function itemDrawer(sectionId, item = null) {
    const section = findSection(sectionId);
    const it = item ? clone(item) : {
      id: uid(8), label: '', kind: 'toggle', description: '', clientDescription: '', price: { mode: 'fixed', amount: 0 },
      options: [], percent: 0, multiplierTargets: [], unit: '', includedQty: 0, bands: [], bandMode: 'tiered',
      complexityWeight: 1, recurring: false, visible: true, showOnQuote: true, placeholder: false, default: null,
    };
    const used = item ? quotesUsingItem(item.id) : [];

    drawer({
      title: item ? `Edit ${item.label}` : 'New item',
      submitLabel: item ? 'Apply' : 'Add item',
      body: html`<div class="stack">
        ${used.length ? html`<div class="notice info">${icon('quotes')}<div>Used by ${used.length} ${used.length === 1 ? 'quote' : 'quotes'}. Saved quotes keep the version they were priced with.</div></div>` : ''}
        <div class="grid g2">
          ${f.text('label', 'Label', it.label, { placeholder: 'Booking / calendar' })}
          ${f.select('kind', 'Kind', it.kind, KINDS)}
          ${f.textarea('description', 'Description', it.description, { rows: 2, hint: 'shown to you', cls: 'span2' })}
          ${f.textarea('clientDescription', 'Client description', it.clientDescription, { rows: 2, hint: 'printed on the quote', cls: 'span2' })}
        </div>

        <div data-show="toggle quantity">${priceInput('price', it.price, it.kind === 'quantity' ? 'Unit price' : 'Price')}</div>

        <div class="stack-sm" data-show="single-select multi-select complexity multiplier quantity">
          <div class="btn-row"><div class="section-title grow" data-options-title>Options</div><button type="button" class="btn btn-sm" data-add-opt>${icon('plus')}Option</button></div>
          <div class="opt-list" data-opts>${it.options.map((o) => optionRow(o, it.id))}</div>
        </div>

        <div class="grid g2" data-show="quantity">
          ${f.text('unit', 'Unit', it.unit, { placeholder: 'page' })}
          ${f.number('includedQty', 'Always included', it.includedQty, { min: 0, step: 1 })}
          ${f.select('bandMode', 'Bands', it.bandMode, [{ value: 'tiered', label: 'Tiered per unit' }, { value: 'flat', label: 'Flat price per band' }], { cls: 'span2' })}
          <div class="stack-sm span2"><div class="btn-row"><span class="label grow">Bands <span class="hint">replace option prices when set</span></span><button type="button" class="btn btn-sm" data-add-band>${icon('plus')}Band</button></div>
            <div class="stack-sm" data-bands>${(it.bands || []).map(bandRow)}</div></div>
        </div>

        <div data-show="percentage">${f.number('percent', 'Percentage', it.percent, { suffix: '%', hint: 'negative for a discount', step: 0.5 })}</div>

        <div class="field" data-show="multiplier single-select"><span class="label">Multiplier applies to</span>
          <div class="chips">${cfg.sections.filter((s) => s.id !== sectionId).map((s) => html`<label class="chip chip-check"><input type="checkbox" name="target" value="${s.id}"${attr((it.multiplierTargets || []).includes(s.id), 'checked')}>${s.name}</label>`)}</div>
          <span class="faint">None ticked means every once-off section.</span></div>

        <div class="grid g2">
          ${f.number('complexityWeight', 'Complexity weight', it.complexityWeight, { step: 0.5, hint: 'feeds the internal score' })}
          <div class="field" data-show="single-select complexity multiplier"><label class="label" for="f-default">Default</label>
            <select class="select" id="f-default" name="default"><option value="">None</option>${it.options.map((o) => html`<option value="${o.id}"${attr(it.default === o.id, 'selected')}>${o.label}</option>`)}</select></div>
          <div data-show="toggle">${f.check('defaultOn', 'On by default', it.default === true)}</div>
        </div>
        <div class="stack-sm">
          ${f.check('recurring', 'Recurring monthly', it.recurring, { hint: 'totalled separately on the quote' })}
          ${f.check('showOnQuote', 'Show on the quote', it.showOnQuote !== false)}
          ${f.check('visible', 'Visible in the quote builder', it.visible !== false)}
          ${f.check('placeholder', 'Placeholder price', it.placeholder, { hint: 'untick once confirmed' })}
        </div>
      </div>`,
      onOpen: (form) => {
        const syncKind = () => {
          const k = form.querySelector('[name="kind"]').value;
          form.querySelectorAll('[data-show]').forEach((n) => { n.hidden = !n.dataset.show.split(' ').includes(k); });
          form.querySelector('[data-options-title]').textContent = k === 'quantity' ? 'Variants' : k === 'complexity' ? 'Levels' : 'Options';
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

        form.addEventListener('click', async (e) => {
          if (e.target.closest('[data-add-opt]')) {
            const o = { id: uid(8), label: '', price: { mode: 'fixed', amount: 0 }, clientDescription: '', multiplier: null, weight: 1, includes: {}, visible: true };
            const list = form.querySelector('[data-opts]');
            list.insertAdjacentHTML('beforeend', String(optionRow(o, it.id)));
            syncKind();
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
          if (e.target.closest('[data-add-band]')) {
            form.querySelector('[data-bands]').insertAdjacentHTML('beforeend', String(bandRow({ upTo: null, price: { mode: 'hours', amount: 0 } })));
          }
          const rb = e.target.closest('[data-remove-band]');
          if (rb) rb.closest('[data-band]').remove();
        });
      },
      onSubmit: (form) => {
        const v = f.readForm(form);
        if (!v.label) { toast('Enter a label.', { error: true }); return false; }
        const options = [...form.querySelectorAll('.opt-card')].map((card) => {
          const g = (n) => card.querySelector(`[data-f="${n}"]`);
          const mode = g('mode').value;
          const rawAmount = g('amount').value;
          const incItem = g('includesItem').value;
          const incQty = Number(g('includesQty').value) || 0;
          const prev = it.options.find((o) => o.id === card.dataset.opt) || {};
          return {
            ...prev,
            id: card.dataset.opt,
            label: g('label').value.trim() || 'Untitled option',
            price: mode === 'hours' ? { mode, amount: Number(String(rawAmount).replace(',', '.')) || 0 } : { mode, amount: parseMoney(rawAmount) },
            clientDescription: g('clientDescription').value.trim(),
            multiplier: g('multiplier').value === '' ? null : Number(g('multiplier').value),
            weight: Number(g('weight').value) || 1,
            includes: incItem && incQty ? { [incItem]: incQty } : {},
            visible: g('visible').checked,
          };
        });
        const bands = [...form.querySelectorAll('[data-band]')].map((row) => {
          const g = (n) => row.querySelector(`[data-f="${n}"]`);
          const mode = g('mode').value;
          return {
            upTo: g('upTo').value === '' ? null : Number(g('upTo').value),
            price: mode === 'hours' ? { mode, amount: Number(String(g('amount').value).replace(',', '.')) || 0 } : { mode, amount: parseMoney(g('amount').value) },
          };
        });
        let def = null;
        if (['single-select', 'complexity', 'multiplier'].includes(v.kind)) def = v.default && options.some((o) => o.id === v.default) ? v.default : null;
        else if (v.kind === 'toggle') def = v.defaultOn ? true : null;
        else if (v.kind === 'multi-select') def = (it.default || []).filter?.((x) => options.some((o) => o.id === x)) || null;

        Object.assign(it, {
          label: v.label, kind: v.kind, description: v.description, clientDescription: v.clientDescription,
          price: readPrice(form, 'price'), options, bands, bandMode: v.bandMode, unit: v.unit,
          includedQty: Number(v.includedQty) || 0, percent: Number(v.percent) || 0,
          multiplierTargets: [...form.querySelectorAll('[name="target"]:checked')].map((x) => x.value),
          complexityWeight: Number(v.complexityWeight) || 0, recurring: v.recurring, showOnQuote: v.showOnQuote,
          visible: v.visible, placeholder: v.placeholder, default: def,
        });
        if (item) section.items[section.items.findIndex((x) => x.id === item.id)] = it;
        else section.items.push(it);
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

  async function history() {
    let versions = [];
    try { versions = await listVersions(30); } catch (e) { toastError(e); return; }
    const m = modal({
      wide: true,
      label: 'Pricing history',
      body: html`<div class="modal-body"><h2>Pricing history</h2><p>Every save is a version. Quotes keep the version they were priced with.</p></div>
        <table class="table"><tbody>${versions.map((v) => html`<tr>
          <td class="mono">v${v.number}</td><td><div class="primary">${v.note || 'No note'}</div><div class="sub">${dateTime(v.createdAt)} · ${money(v.core?.hourlyRate)} an hour</div></td>
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
        ${f.text('note', 'Note', '', { placeholder: 'Raised hourly rate, added booking levels' })}</div>`,
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
