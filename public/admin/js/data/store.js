import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot,
  writeBatch, runTransaction, query, orderBy, limit, where, Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../firebase.js';
import { seedPricing, seedLibraries, seedSettings } from './seed.js';
import { setLocale } from '../lib/format.js';
import { byOrder, uid } from '../lib/util.js';

// A single-user admin holds at most a few thousand documents, so the main collections
// are kept live in memory. Screens read from here and re-render on change events.

export const now = () => Timestamp.now();

export const state = {
  clients: new Map(),
  quotes: new Map(),
  files: new Map(),
  folders: new Map(),
  settings: { business: {}, quoteDefaults: {}, appearance: {}, pricing: {} },
  libraries: {},
  pricing: null,
  loaded: new Set(),
};

export const LIBRARIES = ['statuses', 'paymentTemplates', 'terms', 'scopeTemplates', 'tags', 'sources', 'clientFields'];
const LIVE = ['clients', 'quotes', 'files', 'folders'];
const SETTINGS = ['business', 'quoteDefaults', 'appearance', 'pricing'];

const listeners = new Set();
export function on(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(what) {
  for (const fn of listeners) fn(what);
}

const versionCache = new Map();
const unsubs = [];

export async function init() {
  await ensureSeed();

  const firsts = [];
  const watch = (ref, apply, name) => {
    let resolve;
    firsts.push(new Promise((r) => { resolve = r; }));
    unsubs.push(onSnapshot(ref, (snap) => {
      apply(snap);
      state.loaded.add(name);
      resolve();
      emit(name);
    }, (e) => { console.error(name, e); resolve(); }));
  };

  for (const name of LIVE) {
    watch(collection(db, name), (snap) => {
      const map = state[name];
      snap.docChanges().forEach((c) => {
        if (c.type === 'removed') map.delete(c.doc.id);
        else map.set(c.doc.id, { id: c.doc.id, ...c.doc.data() });
      });
    }, name);
  }
  for (const name of SETTINGS) {
    watch(doc(db, 'settings', name), (snap) => {
      state.settings[name] = snap.data() || {};
      if (name === 'pricing') loadCurrentPricing();
    }, `settings.${name}`);
  }
  for (const name of LIBRARIES) {
    watch(doc(db, 'libraries', name), (snap) => {
      state.libraries[name] = (snap.data()?.items || []).slice().sort(byOrder);
    }, `libraries.${name}`);
  }

  await Promise.all(firsts);
  await loadCurrentPricing();
}

export function teardown() {
  unsubs.splice(0).forEach((u) => u());
  LIVE.forEach((n) => state[n].clear());
  state.loaded.clear();
}

async function loadCurrentPricing() {
  const id = state.settings.pricing?.currentVersionId;
  if (!id) return;
  const v = await getVersion(id);
  state.pricing = v;
  setLocale(v.core || {});
  emit('pricing');
}

export async function getVersion(id) {
  if (!versionCache.has(id)) {
    const snap = await getDoc(doc(db, 'pricingVersions', id));
    if (!snap.exists()) throw new Error(`Pricing version ${id} not found`);
    versionCache.set(id, { id, ...snap.data() });
  }
  return versionCache.get(id);
}

export async function listVersions(n = 20) {
  const snap = await getDocs(query(collection(db, 'pricingVersions'), orderBy('number', 'desc'), limit(n)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function ensureSeed() {
  const pointer = await getDoc(doc(db, 'settings', 'pricing'));
  if (pointer.exists()) return;

  const batch = writeBatch(db);
  const settings = seedSettings();
  for (const [k, v] of Object.entries(settings)) batch.set(doc(db, 'settings', k), v);
  const libs = seedLibraries();
  for (const [k, items] of Object.entries(libs)) batch.set(doc(db, 'libraries', k), { items });
  await batch.commit();
  await savePricingVersion(seedPricing());
}

// Every save of the pricing config is a new immutable version.
export async function savePricingVersion(config) {
  return runTransaction(db, async (tx) => {
    const pointerRef = doc(db, 'settings', 'pricing');
    const pointer = await tx.get(pointerRef);
    const number = (pointer.data()?.latestNumber || 0) + 1;
    const ref = doc(collection(db, 'pricingVersions'));
    const data = {
      number,
      note: config.note || '',
      core: config.core,
      sections: config.sections,
      createdAt: now(),
    };
    tx.set(ref, data);
    tx.set(pointerRef, { currentVersionId: ref.id, latestNumber: number }, { merge: true });
    versionCache.set(ref.id, { id: ref.id, ...data });
    return ref.id;
  });
}

// ---------- generic writes ----------

export async function create(col, data, id = uid(20)) {
  const ts = now();
  await setDoc(doc(db, col, id), { ...data, createdAt: ts, updatedAt: ts });
  return id;
}

export async function update(col, id, patch) {
  await updateDoc(doc(db, col, id), { ...patch, updatedAt: now() });
}

export async function put(col, id, data) {
  await setDoc(doc(db, col, id), data);
}

export async function remove(col, id) {
  await deleteDoc(doc(db, col, id));
}

export async function saveSetting(name, data) {
  await setDoc(doc(db, 'settings', name), data, { merge: true });
}

export async function saveLibrary(name, items) {
  await setDoc(doc(db, 'libraries', name), { items: items.map((x, i) => ({ ...x, order: i })) });
}

export const lib = (name, { all = false } = {}) => (state.libraries[name] || []).filter((x) => all || x.visible !== false);
export const libItem = (name, id) => (state.libraries[name] || []).find((x) => x.id === id);

// ---------- statuses ----------

export const statusById = (id) => libItem('statuses', id);
export const statusByRole = (role) => (state.libraries.statuses || []).find((s) => s.role === role);
export const roleOf = (q) => statusById(q?.status)?.role || 'draft';

// ---------- activity ----------

export async function logQuote(quoteId, type, detail = '') {
  await addDoc(collection(db, 'quotes', quoteId, 'activity'), { type, detail, at: now() });
}

export async function quoteActivity(quoteId) {
  const snap = await getDocs(query(collection(db, 'quotes', quoteId, 'activity'), orderBy('at', 'desc'), limit(100)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function logClient(clientId, type, detail = '') {
  if (!clientId) return;
  await addDoc(collection(db, 'clients', clientId, 'activity'), { type, detail, at: now() });
}

export async function clientSub(clientId, sub) {
  const snap = await getDocs(query(collection(db, 'clients', clientId, sub), orderBy('at', 'desc'), limit(200)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addClientNote(clientId, body) {
  await addDoc(collection(db, 'clients', clientId, 'notes'), { body, at: now() });
}

export async function removeClientNote(clientId, noteId) {
  await deleteDoc(doc(db, 'clients', clientId, 'notes', noteId));
}

// ---------- quote numbering ----------

export function formatNumber(pattern, seq, at = new Date()) {
  const yyyy = String(at.getFullYear());
  return pattern
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yyyy.slice(2))
    .replace(/\{MM\}/g, String(at.getMonth() + 1).padStart(2, '0'))
    .replace(/\{(0+1)\}/g, (_, z) => String(seq).padStart(z.length, '0'));
}

// Numbers come from a per-year counter inside a transaction, so they are never reused,
// even when a numbered quote is later deleted.
export async function nextQuoteNumber() {
  const pattern = state.settings.quoteDefaults.numberPattern || 'DW-{YYYY}-{0001}';
  const at = new Date();
  const key = pattern.includes('{YY') ? String(at.getFullYear()) : 'all';
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'counters', 'quoteNumbers');
    const snap = await tx.get(ref);
    const seq = (snap.data()?.[key] || 0) + 1;
    tx.set(ref, { [key]: seq }, { merge: true });
    return formatNumber(pattern, seq, at);
  });
}

// ---------- references ----------

export function quotesUsingItem(itemId, optionId) {
  const key = optionId ? `${itemId}:${optionId}` : itemId;
  return [...state.quotes.values()].filter((q) => (q.itemIds || []).includes(key));
}

export async function filesWhere(field, value) {
  const snap = await getDocs(query(collection(db, 'files'), where(field, '==', value)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export { db, doc, collection, writeBatch, getDocs, getDoc, setDoc, Timestamp };
