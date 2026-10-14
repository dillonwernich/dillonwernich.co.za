import {
  state, create, update, put, remove, now, logQuote, logClient, nextQuoteNumber, statusById, statusByRole, roleOf,
  getVersion, lib, db, collection, getDocs, writeBatch, Timestamp,
} from '../data/store.js';
import { compute, defaultSelections, itemIdsOf, milestoneAmounts } from '../pricing/engine.js';
import { addDays, toDate } from '../lib/format.js';
import { clone } from '../lib/util.js';

// Quote operations shared by the list, the builder and the dashboard.

export function clientSnapshot(client) {
  if (!client) return null;
  const { company = '', contactName = '', email = '', phone = '', address = '', vatNumber = '' } = client;
  return { company, contactName, email, phone, address, vatNumber };
}

// Recomputes everything derived from selections. Returns the fields to persist.
export function priced(quote, config) {
  const result = compute(config, quote.selections || {});
  return {
    lines: result.lines,
    adjustments: result.adjustments,
    totals: result.totals,
    itemIds: itemIdsOf(quote.selections || {}, config),
  };
}

export function milestonesFor(quote) {
  return milestoneAmounts(quote.payment?.milestones || [], quote.totals?.total || 0);
}

export function blankQuote({ clientId = null } = {}) {
  const config = state.pricing;
  const qd = state.settings.quoteDefaults || {};
  const template = lib('paymentTemplates').find((t) => t.id === qd.defaultPaymentTemplateId) || lib('paymentTemplates')[0];
  const scope = { included: [], excluded: [], assumptions: [] };
  for (const s of lib('scopeTemplates')) if (s.defaultOn && scope[s.kind]) scope[s.kind].push(s.text);
  const client = clientId ? state.clients.get(clientId) : null;

  const q = {
    status: statusByRole('draft')?.id || 'st-draft',
    number: null,
    title: '',
    summary: '',
    clientId,
    clientSnapshot: clientSnapshot(client),
    selections: defaultSelections(config),
    pricingVersionId: config.id,
    scope,
    payment: { templateId: template?.id || null, milestones: clone(template?.milestones || []) },
    terms: lib('terms').filter((t) => t.defaultOn).map(({ id, title, body }) => ({ id, title, body })),
    internal: { notes: '' },
    timeline: { note: '' },
    issueDate: null,
    validUntil: Timestamp.fromDate(addDays(new Date(), Number(qd.validityDays) || 30)),
    revision: 1,
    rootQuoteId: null,
    revisionOf: null,
    supersededBy: null,
    sentAt: null,
    acceptedAt: null,
    declinedAt: null,
  };
  return { ...q, ...priced(q, config) };
}

export async function createQuote(data) {
  const id = await create('quotes', data);
  await logQuote(id, 'created', data.revisionOf ? 'Created as a revision' : '');
  if (data.clientId) await logClient(data.clientId, 'quote', data.title ? `Quote created: ${data.title}` : 'Quote created');
  return id;
}

export async function saveQuote(id, data) {
  await update('quotes', id, data);
}

// Moving out of Draft for the first time assigns the quote number.
export async function setStatus(quote, statusId) {
  const from = statusById(quote.status);
  const to = statusById(statusId);
  if (!to || quote.status === statusId) return null;
  const patch = { status: statusId };
  const qd = state.settings.quoteDefaults || {};

  if (!quote.number && to.role !== 'draft') patch.number = await nextQuoteNumber();
  if (to.role === 'sent' && !quote.sentAt) {
    patch.sentAt = now();
    patch.issueDate = now();
    patch.validUntil = Timestamp.fromDate(addDays(new Date(), Number(qd.validityDays) || 30));
  }
  if (to.role === 'accepted') patch.acceptedAt = now();
  if (to.role === 'declined') patch.declinedAt = now();

  const before = { status: quote.status };
  await update('quotes', quote.id, patch);
  await logQuote(quote.id, 'status', `${from?.label || 'Unknown'} → ${to.label}${patch.number ? ` · numbered ${patch.number}` : ''}`);
  if (quote.clientId) await logClient(quote.clientId, 'status', `${patch.number || quote.number || quote.title || 'Quote'} marked ${to.label.toLowerCase()}`);
  return async () => {
    await update('quotes', quote.id, before);
    await logQuote(quote.id, 'status', `${to.label} → ${from?.label || 'Unknown'} (undone)`);
  };
}

export async function createRevision(quote) {
  const rootId = quote.rootQuoteId || quote.id;
  const family = [...state.quotes.values()].filter((q) => q.id === rootId || q.rootQuoteId === rootId);
  const revision = Math.max(...family.map((q) => q.revision || 1)) + 1;
  const root = state.quotes.get(rootId) || quote;
  const baseNumber = (root.number || '').replace(/-R\d+$/, '');
  const copy = stripMeta(quote);
  const data = {
    ...copy,
    status: statusByRole('draft')?.id,
    number: baseNumber ? `${baseNumber}-R${revision}` : null,
    revision,
    rootQuoteId: rootId,
    revisionOf: quote.id,
    supersededBy: null,
    sentAt: null, acceptedAt: null, declinedAt: null, issueDate: null,
  };
  const id = await createQuote(data);
  const superseded = statusByRole('superseded');
  await update('quotes', quote.id, { supersededBy: id, ...(superseded ? { status: superseded.id } : {}) });
  await logQuote(quote.id, 'revision', `Superseded by ${data.number || 'revision ' + revision}`);
  return id;
}

export async function duplicateQuote(quote, clientId = quote.clientId) {
  const client = clientId ? state.clients.get(clientId) : null;
  const config = await getVersion(quote.pricingVersionId);
  const qd = state.settings.quoteDefaults || {};
  const data = {
    ...stripMeta(quote),
    status: statusByRole('draft')?.id,
    number: null,
    clientId,
    clientSnapshot: clientSnapshot(client),
    revision: 1, rootQuoteId: null, revisionOf: null, supersededBy: null,
    sentAt: null, acceptedAt: null, declinedAt: null, issueDate: null,
    validUntil: Timestamp.fromDate(addDays(new Date(), Number(qd.validityDays) || 30)),
  };
  Object.assign(data, priced(data, config));
  const id = await createQuote(data);
  await logQuote(id, 'duplicated', `Duplicated from ${quote.number || quote.title || 'an earlier quote'}`);
  return id;
}

function stripMeta(q) {
  const { id, createdAt, updatedAt, ...rest } = clone(q);
  return rest;
}

// Deletes now and clears the activity log only once the undo window has passed.
export async function deleteQuote(quote) {
  const data = stripMeta(quote);
  const createdAt = quote.createdAt;
  await remove('quotes', quote.id);
  let undone = false;
  setTimeout(async () => {
    if (undone) return;
    const snap = await getDocs(collection(db, 'quotes', quote.id, 'activity'));
    if (!snap.size) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }, 8000);
  return async () => {
    undone = true;
    await put('quotes', quote.id, { ...data, createdAt, updatedAt: now() });
  };
}

export async function expireQuotes() {
  const expired = statusByRole('expired');
  if (!expired) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const q of state.quotes.values()) {
    const until = toDate(q.validUntil);
    if (roleOf(q) === 'sent' && until && until < today) {
      await update('quotes', q.id, { status: expired.id });
      await logQuote(q.id, 'status', `Sent → ${expired.label} (validity passed)`);
    }
  }
}

