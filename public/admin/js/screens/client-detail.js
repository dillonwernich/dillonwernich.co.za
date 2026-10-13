import { html } from '../lib/html.js';
import { money, date, dateTime, bytes } from '../lib/format.js';
import {
  state, lib, libItem, statusById, update, remove, clientSub, addClientNote, removeClientNote, logClient,
  db, doc, collection, getDocs, writeBatch, setDoc, now,
} from '../data/store.js';
import { icon } from '../ui/icons.js';
import { statusBadge, skeletonBlock } from '../ui/blocks.js';
import { menu, confirm, drawer } from '../ui/overlay.js';
import * as f from '../ui/fields.js';
import { toast, toastError } from '../ui/toast.js';
import { navigate } from '../router.js';
import { sortBy } from '../lib/util.js';
import { clientDrawer, clientName, tagLabel } from './client-form.js';

const ACTIVITY = { created: 'Created', edited: 'Edited', quote: 'Quote', status: 'Quote status', file: 'File', merged: 'Merged' };

export default async function clientDetail(view) {
  const id = view.params.id;

  const drawHeader = (c) => view.header({
    title: clientName(c),
    crumb: { href: '/admin/clients/', label: 'Clients' },
    actions: html`<a class="btn hide-sm" href="/admin/quotes/new/?client=${id}">${icon('plus')}New quote</a>
      <button type="button" class="btn" data-act="edit">${icon('edit')}Edit</button>
      <button type="button" class="icon-btn" data-act="more" aria-label="More actions">${icon('more')}</button>`,
  });

  const draw = async () => {
    const pending = view.el.querySelector('[data-note-form] textarea')?.value || '';
    const c = state.clients.get(id);
    if (!c) {
      view.header({ title: 'Client not found', crumb: { href: '/admin/clients/', label: 'Clients' } });
      view.el.innerHTML = String(html`<div class="panel"><div class="empty"><p>This client does not exist or was merged.</p><a class="btn" href="/admin/clients/">All clients</a></div></div>`);
      return;
    }
    if (c.mergedInto) { navigate(`/admin/clients/${c.mergedInto}/`, { replace: true }); return; }
    drawHeader(c);

    const quotes = sortBy([...state.quotes.values()].filter((q) => q.clientId === id), (q) => -(q.updatedAt?.seconds || 0));
    const files = [...state.files.values()].filter((x) => x.clientId === id && !x.deletedAt);
    const source = libItem('sources', c.sourceId);
    const customDefs = lib('clientFields', { all: true });

    view.el.innerHTML = String(html`
      <div class="detail">
        <div class="stack">
          <section class="panel">
            <div class="panel-head"><h2>Quotes</h2><div class="btn-row"><a class="btn btn-sm" href="/admin/quotes/new/?client=${id}">${icon('plus')}New quote</a></div></div>
            ${quotes.length ? html`<table class="table"><tbody>${quotes.map((q) => html`<tr class="link" data-href="/admin/quotes/${q.id}/">
              <td><div class="primary">${q.title || 'Untitled quote'}</div><div class="sub">${q.number || 'Draft'}</div></td>
              <td class="col-opt">${statusBadge(statusById(q.status))}</td>
              <td class="num">${money(q.totals?.total)}</td></tr>`)}</tbody></table>`
              : html`<div class="panel-body muted">No quotes for this client.</div>`}
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Files</h2><div class="btn-row"><a class="btn btn-sm" href="/admin/files/?client=${id}">${icon('upload')}Upload</a></div></div>
            ${files.length ? html`<table class="table"><tbody>${files.map((x) => html`<tr class="link" data-href="/admin/files/?file=${x.id}">
              <td><div class="primary">${x.name}</div></td><td class="num faint">${bytes(x.size)}</td><td class="num faint col-opt">${date(x.createdAt)}</td></tr>`)}</tbody></table>`
              : html`<div class="panel-body muted">No files for this client.</div>`}
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Notes</h2></div>
            <div class="panel-body stack-sm">
              <form class="stack-sm" data-note-form>
                <textarea class="textarea" name="note" rows="2" placeholder="Called about phase two. Wants a quote for the booking system by Friday." aria-label="New note"></textarea>
                <div><button type="submit" class="btn btn-sm">Add note</button></div>
              </form>
              <ul class="timeline" data-notes>${skeletonBlock(2)}</ul>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Activity</h2></div>
            <div class="panel-body"><ul class="timeline" data-activity></ul></div>
          </section>
        </div>

        <aside class="panel">
          <div class="panel-head"><h2>Details</h2></div>
          <div class="panel-body">
            <dl class="kv">
              ${c.company ? html`<dt>Company</dt><dd>${c.company}</dd>` : ''}
              ${c.contactName ? html`<dt>Contact</dt><dd>${c.contactName}</dd>` : ''}
              ${c.email ? html`<dt>Email</dt><dd><a href="mailto:${c.email}">${c.email}</a></dd>` : ''}
              ${c.phone ? html`<dt>Phone</dt><dd><a href="tel:${c.phone.replace(/\s/g, '')}">${c.phone}</a></dd>` : ''}
              ${c.website ? html`<dt>Website</dt><dd><a href="${/^https?:/.test(c.website) ? c.website : `https://${c.website}`}" target="_blank" rel="noopener">${c.website}</a></dd>` : ''}
              ${c.address ? html`<dt>Address</dt><dd>${c.address}</dd>` : ''}
              ${c.vatNumber ? html`<dt>VAT no.</dt><dd>${c.vatNumber}</dd>` : ''}
              ${source ? html`<dt>Source</dt><dd>${source.label}</dd>` : ''}
              ${(c.tags || []).length ? html`<dt>Tags</dt><dd>${c.tags.map(tagLabel).filter(Boolean).map((t) => html`<span class="tag">${t}</span>`)}</dd>` : ''}
              ${customDefs.filter((d) => c.custom?.[d.id] != null && c.custom[d.id] !== '').map((d) => html`<dt>${d.label}</dt><dd>${d.type === 'date' ? date(c.custom[d.id]) : c.custom[d.id]}</dd>`)}
              ${c.notes ? html`<dt>Notes</dt><dd>${c.notes}</dd>` : ''}
              <dt>Added</dt><dd>${date(c.createdAt)}</dd>
            </dl>
          </div>
        </aside>
      </div>`);

    if (pending) view.el.querySelector('[data-note-form] textarea').value = pending;
    drawNotes();
    drawActivity();
  };

  const drawNotes = async () => {
    const box = view.el.querySelector('[data-notes]');
    if (!box) return;
    const notes = await clientSub(id, 'notes');
    box.innerHTML = String(notes.length
      ? html`${notes.map((n) => html`<li><time>${dateTime(n.at)}</time><div class="note-row"><div class="note-body grow">${n.body}</div>
          <button type="button" class="icon-btn sm" data-act="note-delete" data-id="${n.id}" aria-label="Delete note">${icon('x')}</button></div></li>`)}`
      : html`<li class="faint">No notes yet.</li>`);
  };

  const drawActivity = async () => {
    const box = view.el.querySelector('[data-activity]');
    if (!box) return;
    const items = await clientSub(id, 'activity');
    box.innerHTML = String(items.length
      ? html`${items.map((a) => html`<li><time>${dateTime(a.at)}</time><div>${a.detail || ACTIVITY[a.type] || a.type}</div></li>`)}`
      : html`<li class="faint">No activity yet.</li>`);
  };

  view.el.addEventListener('submit', async (e) => {
    if (!e.target.matches('[data-note-form]')) return;
    e.preventDefault();
    const ta = e.target.querySelector('textarea');
    const body = ta.value.trim();
    if (!body) return;
    try {
      await addClientNote(id, body);
      await update('clients', id, {});
      ta.value = '';
      toast('Note added.');
      drawNotes();
    } catch (err) { toastError(err); }
  });

  view.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act="note-delete"]');
    if (b) {
      const notes = await clientSub(id, 'notes');
      const note = notes.find((n) => n.id === b.dataset.id);
      try {
        await removeClientNote(id, b.dataset.id);
        drawNotes();
        toast('Note deleted.', { undo: async () => { await addClientNote(id, note.body); drawNotes(); } });
      } catch (err) { toastError(err); }
      return;
    }
    const row = e.target.closest('tr[data-href]');
    if (row) navigate(row.dataset.href);
  });

  const headerEl = document.querySelector('[data-actions]');
  const onHeader = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const c = state.clients.get(id);
    if (b.dataset.act === 'edit') clientDrawer(c);
    if (b.dataset.act === 'more') {
      menu(b, [
        { label: 'New quote', icon: 'plus', onSelect: () => navigate(`/admin/quotes/new/?client=${id}`) },
        { label: 'Merge a duplicate into this client', icon: 'merge', onSelect: () => mergeDrawer(c) },
        'sep',
        { label: 'Delete client', icon: 'trash', danger: true, onSelect: () => deleteClient(c) },
      ]);
    }
  };
  headerEl.addEventListener('click', onHeader);
  view.onCleanup(() => headerEl.removeEventListener('click', onHeader));

  async function deleteClient(c) {
    const quoteCount = [...state.quotes.values()].filter((q) => q.clientId === id).length;
    if (quoteCount) {
      toast(`This client has ${quoteCount} ${quoteCount === 1 ? 'quote' : 'quotes'}. Merge it into another client instead.`, { error: true });
      return;
    }
    if (!(await confirm({ title: `Delete ${clientName(c)}?`, body: 'Notes and activity for this client are deleted too.', confirmLabel: 'Delete', danger: true }))) return;
    try {
      const { id: _id, ...data } = c;
      await remove('clients', id);
      let undone = false;
      // Sub-collections go only after the undo window, so undo restores everything.
      setTimeout(async () => {
        if (undone) return;
        const batch = writeBatch(db);
        for (const sub of ['notes', 'activity']) {
          (await getDocs(collection(db, 'clients', id, sub))).docs.forEach((d) => batch.delete(d.ref));
        }
        await batch.commit();
      }, 8000);
      navigate('/admin/clients/', { force: true });
      toast('Client deleted.', {
        undo: async () => {
          undone = true;
          await setDoc(doc(db, 'clients', id), { ...data, updatedAt: now() });
        },
      });
    } catch (err) { toastError(err); }
  }

  // Moves quotes, files, notes and activity from the duplicate into this client,
  // fills blank fields from it, unions tags, then marks the duplicate as merged.
  function mergeDrawer(target) {
    const others = sortBy([...state.clients.values()].filter((c) => c.id !== id && !c.mergedInto), (c) => clientName(c));
    if (!others.length) { toast('There are no other clients to merge.'); return; }
    drawer({
      title: 'Merge duplicate',
      submitLabel: 'Merge',
      guard: false,
      body: html`<div class="stack">
        <p class="muted">Pick the duplicate. Its quotes, files, notes and activity move to ${clientName(target)}, and empty fields here are filled from it.</p>
        ${f.select('source', 'Duplicate client', '', others.map((c) => ({ value: c.id, label: `${clientName(c)}${c.email ? ` · ${c.email}` : ''}` })), { empty: 'Choose a client' })}
      </div>`,
      onSubmit: async (form) => {
        const sourceId = f.readForm(form).source;
        if (!sourceId) { toast('Choose the duplicate client.', { error: true }); return false; }
        const source = state.clients.get(sourceId);
        if (!(await confirm({ title: `Merge ${clientName(source)}?`, body: 'This cannot be undone.', confirmLabel: 'Merge', danger: true }))) return false;
        try {
          const batch = writeBatch(db);
          const fill = {};
          for (const k of ['company', 'contactName', 'email', 'phone', 'website', 'address', 'vatNumber', 'sourceId']) {
            if (!target[k] && source[k]) fill[k] = source[k];
          }
          fill.tags = [...new Set([...(target.tags || []), ...(source.tags || [])])];
          fill.custom = { ...(source.custom || {}), ...(target.custom || {}) };
          if (source.notes) fill.notes = [target.notes, source.notes].filter(Boolean).join('\n\n');
          fill.updatedAt = now();
          batch.update(doc(db, 'clients', id), fill);
          for (const q of state.quotes.values()) if (q.clientId === sourceId) batch.update(doc(db, 'quotes', q.id), { clientId: id, updatedAt: now() });
          for (const x of state.files.values()) if (x.clientId === sourceId) batch.update(doc(db, 'files', x.id), { clientId: id, updatedAt: now() });
          for (const sub of ['notes', 'activity']) {
            const snap = await getDocs(collection(db, 'clients', sourceId, sub));
            snap.docs.forEach((d) => {
              batch.set(doc(db, 'clients', id, sub, d.id), d.data());
              batch.delete(d.ref);
            });
          }
          batch.update(doc(db, 'clients', sourceId), { mergedInto: id, updatedAt: now() });
          await batch.commit();
          await logClient(id, 'merged', `Merged ${clientName(source)} into this client`);
          toast('Clients merged.');
        } catch (err) { toastError(err, 'Could not merge.'); return false; }
        return true;
      },
    });
  }

  await draw();
  view.watch(['clients', 'quotes', 'files'], () => draw());
}
