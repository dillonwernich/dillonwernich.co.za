import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

const OWNER = 'U8SYctoCDlVkSrhNYO2c033lrcU2';
const now = () => Math.floor(Date.now() / 1000);

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'dillon-wernich',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});

after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
});

const owner = (authTime = now()) => env.authenticatedContext(OWNER, { auth_time: authTime });
const stranger = () => env.authenticatedContext('someone-else', { auth_time: now() });
const anon = () => env.unauthenticatedContext();

function quote(overrides = {}) {
  return {
    status: 'draft',
    title: 'Website for Umhlanga Ridge Logistics',
    clientId: null,
    selections: {},
    pricingVersionId: 'v1',
    lines: [],
    totals: { total: 1250000, monthly: 0 },
    itemIds: [],
    number: null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  };
}

function version(overrides = {}) {
  return {
    number: 1,
    core: { hourlyRate: 65000, vatRate: 15, vatRegistered: false },
    sections: [],
    createdAt: Timestamp.now(),
    ...overrides,
  };
}

describe('firestore: access', () => {
  test('owner can read and write clients', async () => {
    const db = owner().firestore();
    await assertSucceeds(setDoc(doc(db, 'clients/c1'), { company: 'Khumalo Projects (Pty) Ltd', tags: [], custom: {} }));
    await assertSucceeds(getDoc(doc(db, 'clients/c1')));
  });

  test('another signed-in user is refused everywhere', async () => {
    const db = stranger().firestore();
    await assertFails(getDoc(doc(db, 'clients/c1')));
    await assertFails(getDocs(collection(db, 'quotes')));
    await assertFails(setDoc(doc(db, 'settings/business'), { name: 'x' }));
  });

  test('signed-out visitors are refused', async () => {
    const db = anon().firestore();
    await assertFails(getDoc(doc(db, 'settings/business')));
    await assertFails(getDocs(collection(db, 'files')));
  });

  test('unknown collections are closed even to the owner', async () => {
    await assertFails(setDoc(doc(owner().firestore(), 'anything/else'), { a: 1 }));
  });
});

describe('firestore: sign out everywhere', () => {
  test('sessions older than validAfter lose access', async () => {
    const cutoff = now();
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'settings/security'), { validAfter: cutoff }));
    await assertFails(getDoc(doc(owner(cutoff - 60).firestore(), 'settings/business')));
    await assertSucceeds(getDoc(doc(owner(cutoff + 1).firestore(), 'settings/business')));
  });

  test('owner can always set validAfter, but only as an integer', async () => {
    const db = owner().firestore();
    await assertSucceeds(setDoc(doc(db, 'settings/security'), { validAfter: now() }));
    await assertFails(setDoc(doc(db, 'settings/security'), { validAfter: 'soon' }));
    await assertFails(setDoc(doc(db, 'settings/security'), { validAfter: now(), extra: true }));
  });
});

describe('firestore: quote shape', () => {
  test('valid quote is accepted', async () => {
    await assertSucceeds(setDoc(doc(owner().firestore(), 'quotes/q1'), quote()));
  });

  test('missing totals is rejected', async () => {
    const q = quote();
    delete q.totals;
    await assertFails(setDoc(doc(owner().firestore(), 'quotes/q1'), q));
  });

  test('non-integer money is rejected', async () => {
    await assertFails(setDoc(doc(owner().firestore(), 'quotes/q1'),
      quote({ totals: { total: 12500.5, monthly: 0 } })));
  });

  test('update that breaks shape is rejected', async () => {
    const db = owner().firestore();
    await setDoc(doc(db, 'quotes/q1'), quote());
    await assertFails(updateDoc(doc(db, 'quotes/q1'), { itemIds: 'not-a-list' }));
    await assertSucceeds(updateDoc(doc(db, 'quotes/q1'), { title: 'Revised title', updatedAt: Timestamp.now() }));
  });

  test('activity entries are append-only', async () => {
    const db = owner().firestore();
    await setDoc(doc(db, 'quotes/q1'), quote());
    const entry = doc(db, 'quotes/q1/activity/a1');
    await assertSucceeds(setDoc(entry, { type: 'created', at: Timestamp.now() }));
    await assertFails(updateDoc(entry, { type: 'edited' }));
  });
});

describe('firestore: pricing versions', () => {
  test('valid version can be created', async () => {
    await assertSucceeds(setDoc(doc(owner().firestore(), 'pricingVersions/v1'), version()));
  });

  test('versions are immutable', async () => {
    const db = owner().firestore();
    await setDoc(doc(db, 'pricingVersions/v1'), version());
    await assertFails(updateDoc(doc(db, 'pricingVersions/v1'), { number: 2 }));
    await assertFails(deleteDoc(doc(db, 'pricingVersions/v1')));
  });

  test('malformed core is rejected', async () => {
    await assertFails(setDoc(doc(owner().firestore(), 'pricingVersions/v1'),
      version({ core: { hourlyRate: '650', vatRate: 15, vatRegistered: false } })));
  });
});

describe('storage', () => {
  const bytes = (n) => new Uint8Array(n);

  test('owner can upload and read a file', async () => {
    const s = owner().storage();
    await assertSucceeds(uploadBytes(ref(s, 'files/f1/brief.pdf'), bytes(1024)));
    await assertSucceeds(getBytes(ref(s, 'files/f1/brief.pdf')));
  });

  test('other users cannot read or upload', async () => {
    await env.withSecurityRulesDisabled((ctx) => uploadBytes(ref(ctx.storage(), 'files/f1/brief.pdf'), bytes(10)));
    await assertFails(getBytes(ref(stranger().storage(), 'files/f1/brief.pdf')));
    await assertFails(uploadBytes(ref(stranger().storage(), 'files/f2/x.pdf'), bytes(10)));
  });

  test('upload ceiling follows settings', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'settings/quoteDefaults'), { maxUploadMB: 1 }));
    const s = owner().storage();
    await assertSucceeds(uploadBytes(ref(s, 'files/f1/small.bin'), bytes(512 * 1024)));
    await assertFails(uploadBytes(ref(s, 'files/f2/large.bin'), bytes(2 * 1024 * 1024)));
  });

  test('business assets must be images', async () => {
    const s = owner().storage();
    await assertSucceeds(uploadBytes(ref(s, 'business/logo.png'), bytes(100), { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(s, 'business/logo.exe'), bytes(100), { contentType: 'application/octet-stream' }));
  });
});
