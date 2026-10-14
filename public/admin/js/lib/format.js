// All money is stored as integer cents. Formatting follows the brief: "R 12 500,00".

let currency = 'ZAR';
let locale = 'en-ZA';

export function setLocale(next) {
  currency = next.currency || 'ZAR';
  locale = next.locale || 'en-ZA';
}

const nbsp = /[  ]/g;

export function money(cents, { decimals = true } = {}) {
  const value = (Number(cents) || 0) / 100;
  if (currency === 'ZAR') {
    const fixed = Math.abs(value).toFixed(decimals ? 2 : 0);
    const [whole, frac] = fixed.split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${value < 0 ? '−' : ''}R ${grouped}${frac ? `,${frac}` : ''}`;
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency, minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0,
  }).format(value);
}

export const moneyPlain = (cents) => money(cents).replace(nbsp, ' ');

// Parses "12 500,50", "12500.50" or "R 12 500" into cents.
export function parseMoney(input) {
  if (typeof input === 'number') return Math.round(input * 100);
  let s = String(input ?? '').replace(/[R\s  ]/g, '');
  if (!s) return 0;
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export const centsToInput = (cents) => ((Number(cents) || 0) / 100).toFixed(2).replace('.', ',');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') return new Date(v.length === 10 ? `${v}T00:00:00` : v);
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  return null;
}

export function date(v) {
  const d = toDate(v);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
}

export function dateLong(v) {
  const d = toDate(v);
  return d ? `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}` : '';
}

export function time(v) {
  const d = toDate(v);
  return d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
}

export function dateTime(v) {
  const d = toDate(v);
  return d ? `${date(d)}, ${time(d)}` : '';
}

export function relative(v) {
  const d = toDate(v);
  if (!d) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400 && new Date().getDate() === d.getDate()) return `Today, ${time(d)}`;
  return date(d);
}

// yyyy-mm-dd in local time, for <input type="date">.
export function isoDay(v) {
  const d = toDate(v);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(v, days) {
  const d = new Date(toDate(v) || Date.now());
  d.setDate(d.getDate() + days);
  return d;
}

export function bytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB`;
  return `${(v / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function percent(p) {
  const n = Math.round((Number(p) || 0) * 100) / 100;
  return `${n < 0 ? '−' : ''}${String(Math.abs(n)).replace('.', ',')}%`;
}
