// Pure pricing: (config, selections) -> lines and totals. No Firestore, no DOM, so the
// quote builder, the pricing preview and the print document all agree to the cent.
//
// Selection shapes by kind:
//   single-select, complexity, multiplier  optionId
//   multi-select                           [optionId]
//   quantity                               { [optionId | '_']: qty }
//   toggle                                 true
//   percentage                             { on: true, percent }

export const KINDS = [
  { value: 'single-select', label: 'Single select' },
  { value: 'multi-select', label: 'Multi select' },
  { value: 'quantity', label: 'Quantity' },
  { value: 'toggle', label: 'Toggle' },
  { value: 'complexity', label: 'Complexity' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'multiplier', label: 'Multiplier' },
];

export const hasOptions = (kind) => ['single-select', 'multi-select', 'complexity', 'multiplier', 'quantity'].includes(kind);

export function priceOf(price, rate) {
  const amount = Number(price?.amount) || 0;
  if (price?.mode === 'hours') return { cents: Math.round(amount * rate), hours: amount };
  return { cents: Math.round(amount), hours: rate > 0 ? amount / rate : 0 };
}

export function describePrice(price, rate, fmtMoney) {
  if (!price) return '';
  if (price.mode === 'hours') return `${String(price.amount).replace('.', ',')} h · ${fmtMoney(Math.round(price.amount * rate))}`;
  return fmtMoney(price.amount);
}

export function isSelected(item, sel) {
  if (sel == null || sel === false || sel === '') return false;
  switch (item.kind) {
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

function includedFor(item, config, selections) {
  let included = Number(item.includedQty) || 0;
  for (const s of config.sections || []) {
    for (const it of s.items || []) {
      const sel = selections[it.id];
      if (!isSelected(it, sel)) continue;
      const ids = it.kind === 'multi-select' ? sel : typeof sel === 'string' ? [sel] : [];
      for (const id of ids) {
        const o = findOption(it, id);
        if (o?.includes?.[item.id]) included += Number(o.includes[item.id]) || 0;
      }
    }
  }
  return included;
}

function bandPrice(item, qty, rate) {
  const bands = [...(item.bands || [])].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  if (item.bandMode === 'flat') {
    const band = bands.find((b) => b.upTo == null || qty <= b.upTo) || bands[bands.length - 1];
    return band ? priceOf(band.price, rate) : { cents: 0, hours: 0 };
  }
  let cents = 0;
  let hrs = 0;
  let from = 0;
  for (const b of bands) {
    const to = b.upTo ?? Infinity;
    const n = Math.max(0, Math.min(qty, to) - from);
    const p = priceOf(b.price, rate);
    cents += p.cents * n;
    hrs += p.hours * n;
    from = to;
    if (qty <= to) break;
  }
  return { cents, hours: hrs };
}

function quantityLine(item, sel, config, selections, rate) {
  const variants = (item.options || []).filter((o) => Number(sel?.[o.id]) > 0);
  const plainQty = Number(sel?._) || 0;
  const totalQty = variants.reduce((n, o) => n + Number(sel[o.id]), 0) + plainQty;
  const included = includedFor(item, config, selections);
  const unit = item.unit || 'unit';
  const plural = (n) => `${n} ${unit}${n === 1 ? '' : 's'}`;

  if ((item.bands || []).length) {
    const billable = item.bandMode === 'flat' ? totalQty : Math.max(0, totalQty - included);
    const p = billable > 0 ? bandPrice(item, billable, rate) : { cents: 0, hours: 0 };
    return { ...p, detail: plural(totalQty) + (included && item.bandMode !== 'flat' ? `, ${included} included` : ''), weight: 1 };
  }

  // Included units are used up by the variants in configured order.
  let remaining = included;
  let cents = 0;
  let hrs = 0;
  const parts = [];
  const units = [...variants.map((o) => ({ o, qty: Number(sel[o.id]) })), ...(plainQty ? [{ o: { label: '', price: item.price }, qty: plainQty }] : [])];
  for (const { o, qty } of units) {
    const free = Math.min(remaining, qty);
    remaining -= free;
    const p = priceOf(o.price, rate);
    cents += p.cents * (qty - free);
    hrs += p.hours * (qty - free);
    parts.push(o.label ? `${qty} × ${o.label.toLowerCase()}` : plural(qty));
  }
  const detail = parts.join(', ') + (included ? ` (${Math.min(included, totalQty)} included)` : '');
  return { cents, hours: hrs, detail, weight: 1 };
}

export function compute(config, selections = {}, { minimumFee } = {}) {
  const core = config.core || {};
  const rate = Number(core.hourlyRate) || 0;
  const lines = [];
  const multipliers = [];
  const adjustments = [];
  let score = 0;

  const sections = [...(config.sections || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const section of sections) {
    const items = [...(section.items || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const item of items) {
      const sel = selections[item.id];
      if (!isSelected(item, sel)) continue;

      const base = {
        sectionId: section.id, sectionName: section.name, itemId: item.id, kind: item.kind,
        label: item.label, clientDescription: item.clientDescription || '',
        recurring: !!item.recurring, showOnQuote: item.showOnQuote !== false,
      };

      if (item.kind === 'percentage') {
        const pct = Number(sel.percent ?? item.percent) || 0;
        adjustments.push({ ...base, percent: pct });
        continue;
      }

      let cents = 0;
      let hrs = 0;
      let detail = '';
      let weight = 1;
      let optionIds = [];

      if (['single-select', 'complexity', 'multiplier'].includes(item.kind)) {
        const o = findOption(item, sel);
        if (!o) continue;
        optionIds = [o.id];
        const p = priceOf(o.price, rate);
        cents = p.cents;
        hrs = p.hours;
        detail = o.label;
        weight = Number(o.weight) || 1;
        if (o.clientDescription) base.clientDescription = o.clientDescription;
        if (o.multiplier != null && Number(o.multiplier) !== 1) {
          multipliers.push({ factor: Number(o.multiplier), targets: item.multiplierTargets || [], label: `${item.label}: ${o.label}` });
        }
      } else if (item.kind === 'multi-select') {
        const chosen = sel.map((id) => findOption(item, id)).filter(Boolean);
        optionIds = chosen.map((o) => o.id);
        for (const o of chosen) {
          const p = priceOf(o.price, rate);
          cents += p.cents;
          hrs += p.hours;
        }
        detail = chosen.map((o) => o.label).join(', ');
      } else if (item.kind === 'quantity') {
        const q = quantityLine(item, sel, config, selections, rate);
        cents = q.cents;
        hrs = q.hours;
        detail = q.detail;
        optionIds = Object.keys(sel).filter((k) => k !== '_' && Number(sel[k]) > 0);
      } else if (item.kind === 'toggle') {
        const p = priceOf(item.price, rate);
        cents = p.cents;
        hrs = p.hours;
      }

      score += (Number(item.complexityWeight) || 0) * weight;
      lines.push({ ...base, optionIds, detail, amount: cents, hours: hrs });
    }
  }

  // Multipliers scale the once-off lines in their target sections (all sections when
  // no targets are set). They never touch recurring lines.
  for (const line of lines) {
    if (line.recurring) continue;
    let factor = 1;
    for (const m of multipliers) {
      if (!m.targets.length || m.targets.includes(line.sectionId)) factor *= m.factor;
    }
    if (factor !== 1) {
      line.amount = Math.round(line.amount * factor);
      line.hours *= factor;
      line.factor = factor;
    }
  }

  const once = lines.filter((l) => !l.recurring);
  const recurring = lines.filter((l) => l.recurring);
  const base = once.reduce((n, l) => n + l.amount, 0);
  const hoursTotal = once.reduce((n, l) => n + l.hours, 0);
  const adj = adjustments.filter((a) => !a.recurring).map((a) => ({ ...a, amount: Math.round((base * a.percent) / 100) }));
  let subtotal = base + adj.reduce((n, a) => n + a.amount, 0);

  const floor = Number(minimumFee ?? core.minimumFee) || 0;
  const floorApplied = base > 0 && subtotal < floor;
  if (floorApplied) subtotal = floor;

  const vatRegistered = !!core.vatRegistered;
  const vatRate = Number(core.vatRate) || 0;
  const vat = vatRegistered ? Math.round((subtotal * vatRate) / 100) : 0;
  const monthlyNet = recurring.reduce((n, l) => n + l.amount, 0);
  const monthlyVat = vatRegistered ? Math.round((monthlyNet * vatRate) / 100) : 0;

  return {
    lines,
    adjustments: adj,
    multipliers,
    totals: {
      base,
      adjustments: adj.reduce((n, a) => n + a.amount, 0),
      floor,
      floorApplied,
      subtotal,
      vatRegistered,
      vatRate,
      vat,
      total: subtotal + vat,
      monthlyNet,
      monthlyVat,
      monthly: monthlyNet + monthlyVat,
      hours: Math.round(hoursTotal * 10) / 10,
      score,
      hourlyRate: rate,
      effectiveRate: hoursTotal > 0 ? Math.round(subtotal / hoursTotal) : 0,
    },
  };
}

export function estimateWeeks(hoursTotal, hoursPerWeek) {
  const per = Number(hoursPerWeek) || 20;
  return Math.max(1, Math.ceil((Number(hoursTotal) || 0) / per));
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
        const optIds = Array.isArray(sel) ? sel : typeof sel === 'string' ? [sel] : it.kind === 'quantity' ? Object.keys(sel || {}).filter((k) => k !== '_') : [];
        for (const o of optIds) ids.push(`${it.id}:${o}`);
      }
    }
  }
  return ids;
}
