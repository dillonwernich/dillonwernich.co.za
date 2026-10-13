// Tagged-template HTML with escaping by default. Interpolate raw() only for markup
// this codebase produced itself; anything that came from Firestore stays escaped.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const raw = (s) => new Raw(String(s ?? ''));

function render(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

export function el(markup) {
  const t = document.createElement('template');
  t.innerHTML = String(markup).trim();
  return t.content.firstElementChild;
}

export function mount(target, markup) {
  target.innerHTML = String(markup);
  return target;
}

export const attr = (cond, name, value = '') => (cond ? raw(value === '' ? ` ${name}` : ` ${name}="${esc(value)}"`) : '');
