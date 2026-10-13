const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function uid(len = 12) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const b of bytes) s += ALPHABET[b % 36];
  return s;
}

export const clone = (v) => (v === undefined ? undefined : structuredClone(v));

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => {
    clearTimeout(t);
    return fn(...args);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

export function sortBy(list, key, dir = 1) {
  const get = typeof key === 'function' ? key : (x) => x[key];
  return [...list].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === 'string') return x.localeCompare(y, 'en-ZA', { sensitivity: 'base' }) * dir;
    return (x > y ? 1 : x < y ? -1 : 0) * dir;
  });
}

export function move(list, from, to) {
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export const renumber = (list) => list.map((x, i) => ({ ...x, order: i }));

export function matches(haystack, needle) {
  if (!needle) return true;
  const h = String(haystack ?? '').toLowerCase();
  return needle.toLowerCase().split(/\s+/).every((part) => h.includes(part));
}

export const formValues = (form) => Object.fromEntries(new FormData(form).entries());

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
