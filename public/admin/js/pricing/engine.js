// Pure pricing: (config, selections) -> lines and totals. No Firestore, no DOM, so the
// quote builder, the pricing preview and the print document all agree to the cent.
//
// Every price is a fixed amount in cents. Quantity items multiply that by a count.
//
// Selection shapes by kind:
//   single-select   optionId
//   multi-select    [optionId]
//   quantity        { [optionId | '_']: qty }
//   toggle          true
//   percentage      { on: true, percent }

export const KINDS = [
  { value: 'toggle', label: 'Fixed price' },
  { value: 'quantity', label: 'Per unit' },
  { value: 'single-select', label: 'Choose one' },
  { value: 'multi-select', label: 'Choose any' },
  { value: 'percentage', label: 'Percentage' },
];

// Kinds from earlier pricing versions that quotes may still reference.
const LEGACY_KIND = { complexity: 'single-select', multiplier: 'single-select' };
export const kindOf = (item) => LEGACY_KIND[item.kind] || item.kind;

export const hasOptions = (kind) => ['single-select', 'multi-select', 'quantity'].includes(kind);

// Prices are integers (cents). Earlier versions stored { mode, amount }, where mode
// 'hours' multiplied by the hourly rate of that version.
export function cents(price, core = {}) {
  if (price == null) return 0;
  if (typeof price === 'object') {
    const amount = Number(price.amount) || 0;
    return price.mode === 'hours' ? Math.round(amount * (Number(core.hourlyRate) || 0)) : Math.round(amount);
  }
  return Math.round(Number(price) || 0);
}

export function isSelected(item, sel) {
  if (sel == null || sel === false || sel === '') return false;
  switch (kindOf(item)) {
    case 'multi-select': return Array.isArray(sel) && sel.length > 0;
    case 'quantity': return Object.values(sel || {}).some((q) => Number(q) > 0);
    case 'percentage': return !!sel.on;
    default: return true;
  }
}

export function defaultSelections(config) {
  const out = {};
  for (const s of config.sections || []) {
    for (const it of s.items || []) {
      if (it.default != null && it.visible !== false) out[it.id] = structuredClone(it.default);
    }
  }
  return out;
}

const findOption = (item, id) => (item.options || []).find((o) => o.id === id);

// Units of a quantity item that come free with chosen options elsewhere, e.g. the five
// pages a brochure site includes.
function includedFor(item, config, selections) {
  let included = Number(item.includedQty) || 0;
  for (const s of config.sections || []) {
    for (const it of s.items || []) {
      const sel = selections[it.id];
      if (!isSelected(it, sel)) continue;
      const ids = kindOf(it) === 'multi-select' ? sel : typeof sel === 'string' ? [sel] : [];
      for (const id of ids) {
        const o = findOption(it, id);
        if (o?.includes?.[item.id]) included += Number(o.includes[item.id]) || 0;
      }
    }
  }
  return included;
}

const plural = (n, unit) => `${n} ${unit || 'unit'}${n === 1 ? '' : 's'}`;

function quantityLine(item, sel, config, selections, core) {
  const variants = (item.options || []).filter((o) => Number(sel?.[o.id]) > 0);
  const plainQty = Number(sel?._) || 0;
  const totalQty = variants.reduce((n, o) => n + Number(sel[o.id]), 0) + plainQty;
  const included = includedFor(item, config, selections);

  // Included units are used up by the variants in configured order.
  let remaining = included;
  let amount = 0;
  const parts = [];
  const units = [...variants.map((o) => ({ o, qty: Number(sel[o.id]) })), ...(plainQty ? [{ o: { label: '', price: item.price }, qty: plainQty }] : [])];
  for (const { o, qty } of units) {
    const free = Math.min(remaining, qty);
    remaining -= free;
    amount += cents(o.price, core) * (qty - free);
    parts.push(o.label ? `${qty} × ${o.label.toLowerCase()}` : plural(qty, item.unit));
  }
  const single = units.length === 1 ? units[0] : null;
  return {
    amount,
    qty: totalQty,
    unitPrice: single ? cents(single.o.price, core) : null,
    included: Math.min(included, totalQty),
    detail: parts.join(', '),
  };
}

export function compute(config, selections = {}) {
  const core = config.core || {};
  const lines = [];
  const adjustments = [];

  const sections = [...(config.sections || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const section of sections) {
    const items = [...(section.items || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const item of items) {
      const sel = selections[item.id];
      if (!isSelected(item, sel)) continue;
      const kind = kindOf(item);

      const base = {
        sectionId: section.id, sectionName: section.name, itemId: item.id, kind,
        label: item.label, clientDescription: item.clientDescription || '',
        unit: item.unit || '', recurring: !!item.recurring, showOnQuote: item.showOnQuote !== false,
        optionIds: [], detail: '', qty: 1, unitPrice: null, included: 0,
      };

      if (kind === 'percentage') {
        adjustments.push({ ...base, percent: Number(sel.percent ?? item.percent) || 0 });
        continue;
      }

      let amount = 0;
      if (kind === 'single-select') {
        const o = findOption(item, sel);
        if (!o) continue;
        base.optionIds = [o.id];
        base.detail = o.label;
        if (o.clientDescription) base.clientDescription = o.clientDescription;
        amount = cents(o.price, core);
      } else if (kind === 'multi-select') {
        const chosen = sel.map((id) => findOption(item, id)).filter(Boolean);
        if (!chosen.length) continue;
        base.optionIds = chosen.map((o) => o.id);
        base.detail = chosen.map((o) => o.label).join(', ');
        amount = chosen.reduce((n, o) => n + cents(o.price, core), 0);
      } else if (kind === 'quantity') {
        const q = quantityLine(item, sel, config, selections, core);
        Object.assign(base, q);
        amount = q.amount;
        base.optionIds = Object.keys(sel).filter((k) => k !== '_' && Number(sel[k]) > 0);
      } else {
        amount = cents(item.price, core);
      }
      lines.push({ ...base, amount });
    }
  }

  const once = lines.filter((l) => !l.recurring);
  const recurring = lines.filter((l) => l.recurring);
  const base = once.reduce((n, l) => n + l.amount, 0);
  const adj = adjustments.filter((a) => !a.recurring).map((a) => ({ ...a, amount: Math.round((base * a.percent) / 100) }));
  const subtotal = Math.max(0, base + adj.reduce((n, a) => n + a.amount, 0));

  const vatRegistered = !!core.vatRegistered;
  const vatRate = Number(core.vatRate) || 0;
  const vat = vatRegistered ? Math.round((subtotal * vatRate) / 100) : 0;
  const monthlyNet = recurring.reduce((n, l) => n + l.amount, 0);
  const monthlyVat = vatRegistered ? Math.round((monthlyNet * vatRate) / 100) : 0;

  return {
    lines,
    adjustments: adj,
    totals: {
      base,
      adjustments: adj.reduce((n, a) => n + a.amount, 0),
      subtotal,
      vatRegistered,
      vatRate,
      vat,
      total: subtotal + vat,
      monthlyNet,
      monthlyVat,
      monthly: monthlyNet + monthlyVat,
    },
  };
}

// Splits a total across milestone percentages; the last milestone absorbs rounding.
export function milestoneAmounts(milestones, total) {
  let allocated = 0;
  return milestones.map((m, i) => {
    const amount = i === milestones.length - 1
      ? total - allocated
      : Math.round((total * (Number(m.percent) || 0)) / 100);
    allocated += amount;
    return { ...m, amount };
  });
}

export function itemIdsOf(selections, config) {
  const ids = [];
  for (const s of config.sections || []) {
    for (const it of s.items || []) {
      if (isSelected(it, selections[it.id])) {
        ids.push(it.id);
        const sel = selections[it.id];
        const optIds = Array.isArray(sel) ? sel : typeof sel === 'string' ? [sel] : kindOf(it) === 'quantity' ? Object.keys(sel || {}).filter((k) => k !== '_') : [];
        for (const o of optIds) ids.push(`${it.id}:${o}`);
      }
    }
  }
  return ids;
}
