import {
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, signOut,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';
import { html, attr } from '../lib/html.js';
import { parseMoney } from '../lib/format.js';
import { auth, storage } from '../firebase.js';
import {
  state, lib, saveSetting, formatNumber, LIBRARIES, db, doc, collection, getDocs, writeBatch, setDoc, Timestamp,
} from '../data/store.js';
import { icon } from '../ui/icons.js';
import { confirm } from '../ui/overlay.js';
import * as f from '../ui/fields.js';
import { toast, toastError } from '../ui/toast.js';
import { navigate } from '../router.js';
import { applyTheme } from '../theme.js';
import { renderLibrary, LIBRARY_DEFS } from './settings-libraries.js';

const TABS = [
  { id: 'business', label: 'Business' },
  { id: 'defaults', label: 'Quote defaults' },
  { id: 'libraries', label: 'Libraries' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'account', label: 'Account' },
  { id: 'data', label: 'Data' },
];

export default function settings(view) {
  const tab = TABS.some((t) => t.id === view.params.query.tab) ? view.params.query.tab : 'business';
  const libName = LIBRARIES.includes(view.params.query.lib) ? view.params.query.lib : 'statuses';
  let dirty = false;
  view.guard(() => dirty);

  view.header({ title: 'Settings' });
  view.el.innerHTML = String(html`
    <nav class="tabs" aria-label="Settings sections">${TABS.map((t) => html`<a href="/admin/settings/?tab=${t.id}"${attr(t.id === tab, 'aria-current', 'page')}>${t.label}</a>`)}</nav>
    <div data-tab></div>`);
  const host = view.el.querySelector('[data-tab]');

  const trackDirty = (form) => {
    form.addEventListener('input', () => { dirty = true; });
    form.addEventListener('change', () => { dirty = true; });
  };

  // ---------- business ----------

  if (tab === 'business') {
    const b = state.settings.business || {};
    const bank = b.bank || {};
    host.innerHTML = String(html`<form class="stack narrow" data-form novalidate>
      ${f.group('Business', html`<div class="grid g2">
        ${f.text('name', 'Name', b.name)}
        ${f.text('tradingName', 'Trading name', b.tradingName, { placeholder: 'Wernich Digital' })}
        ${f.text('email', 'Email', b.email, { type: 'email' })}
        ${f.text('phone', 'Phone', b.phone, { type: 'tel' })}
        ${f.text('website', 'Website', b.website)}
        ${f.text('registrationNumber', 'Registration number', b.registrationNumber, { placeholder: '2024/123456/07' })}
        ${f.textarea('address', 'Address', b.address, { rows: 3, cls: 'span2' })}
      </div>`)}
      ${f.group('VAT', html`<div class="grid g2">${f.text('vatNumber', 'VAT number', b.vatNumber, { hint: 'shown on quotes when set' })}
        <div class="field"><span class="label">Registration</span><div class="muted">${state.pricing?.core?.vatRegistered ? 'Registered. Set the rate under Pricing.' : 'Not registered. Change this under Pricing.'}</div></div></div>`)}
      ${f.group('Banking details', html`<div class="grid g2">
        ${f.text('bank.accountName', 'Account name', bank.accountName)}
        ${f.text('bank.bankName', 'Bank', bank.bankName, { placeholder: 'FNB' })}
        ${f.text('bank.accountNumber', 'Account number', bank.accountNumber)}
        ${f.text('bank.branchCode', 'Branch code', bank.branchCode, { placeholder: '250655' })}
        ${f.text('bank.accountType', 'Account type', bank.accountType, { placeholder: 'Business cheque' })}
      </div>`, 'Printed on quotes so clients can pay the deposit.')}
      ${f.group('Logo', html`<div class="btn-row">
        ${b.logoUrl ? html`<img src="${b.logoUrl}" alt="Current logo" class="logo-preview">` : html`<span class="faint">No logo. Quotes show your name instead.</span>`}
        <label class="btn btn-sm">${icon('upload')}Upload<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden data-logo></label>
        ${b.logoUrl ? html`<button type="button" class="btn btn-sm btn-ghost" data-logo-remove>Remove</button>` : ''}
      </div>`)}
      <div><button type="submit" class="btn btn-primary">Save business details</button></div>
    </form>`);
    const form = host.querySelector('[data-form]');
    trackDirty(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = f.readForm(form);
      const data = { bank: {} };
      for (const [k, val] of Object.entries(v)) {
        if (k.startsWith('bank.')) data.bank[k.slice(5)] = val; else data[k] = val;
      }
      try { await saveSetting('business', data); dirty = false; toast('Business details saved.'); } catch (err) { toastError(err); }
    });
    form.addEventListener('change', async (e) => {
      if (!e.target.matches('[data-logo]') || !e.target.files[0]) return;
      const file = e.target.files[0];
      try {
        const ext = (file.name.split('.').pop() || 'png').toLowerCase();
        const path = `business/logo.${ext}`;
        await uploadBytes(ref(storage, path), file, { contentType: file.type });
        const url = await getDownloadURL(ref(storage, path));
        await saveSetting('business', { logoPath: path, logoUrl: url });
        toast('Logo uploaded.');
        navigate('/admin/settings/?tab=business', { force: true });
      } catch (err) { toastError(err, 'Logo upload failed. Images up to 5 MB.'); }
    });
    form.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-logo-remove]')) return;
      await saveSetting('business', { logoPath: null, logoUrl: null });
      toast('Logo removed.');
      navigate('/admin/settings/?tab=business', { force: true });
    });
  }

  // ---------- quote defaults ----------

  if (tab === 'defaults') {
    const qd = state.settings.quoteDefaults || {};
    host.innerHTML = String(html`<form class="stack narrow" data-form novalidate>
      ${f.group('Numbering', html`<div class="grid g2">
        ${f.text('numberPattern', 'Pattern', qd.numberPattern || 'DW-{YYYY}-{0001}', { hint: '{YYYY} {YY} {MM} {0001}' })}
        <div class="field"><span class="label">Next number looks like</span><div class="mono" data-pattern-preview></div></div>
      </div>`, 'Numbers are assigned when a quote first leaves Draft and are never reused. The counter restarts each year when the pattern contains the year.')}
      ${f.group('Defaults', html`<div class="grid g2">
        ${f.number('validityDays', 'Validity', qd.validityDays ?? 30, { suffix: 'days', min: 1, step: 1 })}
        ${f.number('hoursPerWeek', 'Capacity', qd.hoursPerWeek ?? 20, { suffix: 'h a week', min: 1, step: 1, hint: 'for timeline estimates' })}
        ${f.moneyField('marginThreshold', 'Margin warning below', qd.marginThreshold ?? 45000, { hint: 'effective rate per hour' })}
        ${f.select('defaultPaymentTemplateId', 'Default payment schedule', qd.defaultPaymentTemplateId || '', lib('paymentTemplates').map((t) => ({ value: t.id, label: t.label })))}
        ${f.number('maxUploadMB', 'Maximum upload size', qd.maxUploadMB ?? 25, { suffix: 'MB', min: 1, step: 1, hint: 'enforced by storage rules' })}
      </div>`)}
      <div><button type="submit" class="btn btn-primary">Save quote defaults</button></div>
    </form>`);
    const form = host.querySelector('[data-form]');
    trackDirty(form);
    const preview = () => { host.querySelector('[data-pattern-preview]').textContent = formatNumber(form.numberPattern.value || 'DW-{YYYY}-{0001}', 7); };
    form.numberPattern.addEventListener('input', preview);
    preview();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = f.readForm(form);
      if (!/\{0+1\}/.test(v.numberPattern)) { toast('The pattern needs a sequence such as {0001}.', { error: true }); return; }
      try {
        await saveSetting('quoteDefaults', {
          numberPattern: v.numberPattern,
          validityDays: Math.max(1, Number(v.validityDays) || 30),
          hoursPerWeek: Math.max(1, Number(v.hoursPerWeek) || 20),
          marginThreshold: parseMoney(v.marginThreshold),
          defaultPaymentTemplateId: v.defaultPaymentTemplateId || null,
          maxUploadMB: Math.max(1, Number(v.maxUploadMB) || 25),
        });
        dirty = false;
        toast('Quote defaults saved.');
      } catch (err) { toastError(err); }
    });
  }

  // ---------- libraries ----------

  if (tab === 'libraries') {
    host.innerHTML = String(html`<div class="lib-layout">
      <nav aria-label="Libraries"><ul class="tree">
        ${LIBRARIES.map((n) => html`<li><a href="/admin/settings/?tab=libraries&lib=${n}"${attr(n === libName, 'aria-current', 'page')}>${LIBRARY_DEFS[n].title}</a></li>`)}
      </ul></nav>
      <div data-lib></div>
    </div>`);
    const redraw = renderLibrary(host.querySelector('[data-lib]'), libName);
    view.watch([`libraries.${libName}`], redraw);
  }

  // ---------- appearance ----------

  if (tab === 'appearance') {
    const cur = state.settings.appearance?.theme || 'system';
    host.innerHTML = String(html`<div class="stack narrow">${f.group('Theme', html`<div class="seg" role="group" aria-label="Theme">
      ${['system', 'light', 'dark'].map((t) => html`<button type="button" data-theme-set="${t}" aria-pressed="${t === cur}">${t[0].toUpperCase()}${t.slice(1)}</button>`)}
    </div>`, 'System follows your device setting.')}</div>`);
    host.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-theme-set]');
      if (!b) return;
      const theme = b.dataset.themeSet;
      applyTheme(theme);
      host.querySelectorAll('[data-theme-set]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      try { await saveSetting('appearance', { theme }); toast('Theme saved.'); } catch (err) { toastError(err); }
    });
  }

  // ---------- account ----------

  if (tab === 'account') {
    host.innerHTML = String(html`<div class="stack narrow">
      ${f.group('Signed in as', html`<div>${auth.currentUser?.email}</div>`)}
      <form class="stack-sm" data-pw novalidate>
        ${f.group('Change password', html`<div class="grid g2">
          ${f.text('current', 'Current password', '', { type: 'password', autocomplete: 'current-password', cls: 'span2' })}
          ${f.text('next', 'New password', '', { type: 'password', autocomplete: 'new-password', hint: 'at least 12 characters' })}
          ${f.text('confirm', 'Repeat new password', '', { type: 'password', autocomplete: 'new-password' })}
        </div>`)}
        <div><button type="submit" class="btn btn-primary">Change password</button></div>
      </form>
      ${f.group('Sign out everywhere', html`<div><button type="button" class="btn btn-danger" data-everywhere>${icon('logout')}Sign out everywhere</button></div>`,
        'Ends every session on every device, including this one. Enforced by the database rules, not just the browser.')}
    </div>`);
    host.querySelector('[data-pw]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = f.readForm(e.target);
      if (v.next.length < 12) { toast('Use at least 12 characters.', { error: true }); return; }
      if (v.next !== v.confirm) { toast('The new passwords do not match.', { error: true }); return; }
      try {
        const user = auth.currentUser;
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, v.current));
        await updatePassword(user, v.next);
        e.target.reset();
        toast('Password changed.');
      } catch (err) {
        toast(err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' ? 'The current password is wrong.' : 'Could not change the password.', { error: true });
      }
    });
    host.querySelector('[data-everywhere]').addEventListener('click', async () => {
      if (!(await confirm({ title: 'Sign out everywhere?', body: 'Every device, including this one, has to sign in again.', confirmLabel: 'Sign out everywhere', danger: true }))) return;
      try {
        await setDoc(doc(db, 'settings', 'security'), { validAfter: Math.floor(Date.now() / 1000) });
        await signOut(auth);
      } catch (err) { toastError(err); }
    });
  }

  // ---------- data ----------

  if (tab === 'data') {
    host.innerHTML = String(html`<div class="stack narrow">
      ${f.group('Export', html`<div><button type="button" class="btn" data-export>${icon('download')}Export everything as JSON</button></div>`,
        'Settings, libraries, every pricing version, clients with notes and activity, quotes with activity, file records and folders. File contents stay in Storage.')}
      ${f.group('Import', html`<div><label class="btn">${icon('upload')}Import JSON<input type="file" accept="application/json,.json" hidden data-import></label></div>`,
        'Writes every document in the file, replacing documents with the same ID. Nothing is deleted.')}
    </div>`);
    host.querySelector('[data-export]').addEventListener('click', () => exportAll().catch((e) => toastError(e, 'Export failed.')));
    host.querySelector('[data-import]').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (data.format !== 'dw-admin-export') throw new Error('Not an export from this admin.');
        const count = Object.values(data.collections || {}).reduce((n, docs) => n + Object.keys(docs).length, 0);
        if (!(await confirm({ title: `Import ${count} documents?`, body: `Exported ${data.exportedAt?.slice(0, 10) || 'on an unknown date'}. Documents with the same ID are replaced.`, confirmLabel: 'Import', danger: true }))) return;
        const { written, skipped } = await importAll(data);
        toast(`Imported ${written} documents${skipped ? `. ${skipped} were already here and left unchanged` : ''}.`);
      } catch (err) { toastError(err, err.message?.startsWith('Not an export') ? err.message : 'Import failed. Check the file.'); }
    });
  }
}

// ---------- export / import ----------

const TOP = ['settings', 'libraries', 'pricingVersions', 'counters', 'clients', 'quotes', 'files', 'folders'];
const SUBS = { clients: ['notes', 'activity'], quotes: ['activity'] };

function encode(v) {
  if (v instanceof Timestamp) return { __ts: [v.seconds, v.nanoseconds] };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
}
function decode(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.__ts)) return new Timestamp(v.__ts[0], v.__ts[1]);
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  return v;
}

async function exportAll() {
  const out = { format: 'dw-admin-export', version: 1, exportedAt: new Date().toISOString(), collections: {} };
  for (const name of TOP) {
    const snap = await getDocs(collection(db, name));
    out.collections[name] = {};
    for (const d of snap.docs) {
      out.collections[name][d.id] = encode(d.data());
      for (const sub of SUBS[name] || []) {
        const subSnap = await getDocs(collection(db, name, d.id, sub));
        if (!subSnap.size) continue;
        const key = `${name}/${d.id}/${sub}`;
        out.collections[key] = Object.fromEntries(subSnap.docs.map((s) => [s.id, encode(s.data())]));
      }
    }
  }
  delete out.collections.settings?.security;
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dw-admin-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Export downloaded.');
}

async function importAll(data) {
  const writes = [];
  for (const [path, docs] of Object.entries(data.collections || {})) {
    for (const [id, value] of Object.entries(docs)) {
      if (path === 'settings' && id === 'security') continue;
      writes.push([doc(db, `${path}/${id}`), decode(value)]);
    }
  }
  // Pricing versions and quote activity are create-only in the rules; skip entries
  // that already exist instead of rewriting them.
  const createOnly = [...new Set(writes.map(([ref]) => ref.parent.path).filter((p) => p === 'pricingVersions' || /^quotes\/[^/]+\/activity$/.test(p)))];
  const existing = new Set();
  for (const path of createOnly) {
    (await getDocs(collection(db, path))).docs.forEach((d) => existing.add(d.ref.path));
  }
  const pending = writes.filter(([ref]) => !existing.has(ref.path));
  for (let i = 0; i < pending.length; i += 400) {
    const batch = writeBatch(db);
    pending.slice(i, i + 400).forEach(([ref, value]) => batch.set(ref, value));
    await batch.commit();
  }
  return { written: pending.length, skipped: writes.length - pending.length };
}

