import { html, attr } from '../lib/html.js';
import { state, lib, create, update, logClient } from '../data/store.js';
import { drawer } from '../ui/overlay.js';
import * as f from '../ui/fields.js';
import { toast, toastError } from '../ui/toast.js';

// Shared create/edit drawer for clients. Custom fields come from the clientFields library.

function customField(def, value) {
  const name = `custom.${def.id}`;
  if (def.type === 'number') return f.number(name, def.label, value ?? '');
  if (def.type === 'date') return f.date(name, def.label, value ?? '');
  if (def.type === 'select') return f.select(name, def.label, value ?? '', (def.options || []).map((o) => ({ value: o, label: o })), { empty: 'None' });
  return f.text(name, def.label, value ?? '');
}

export function clientDrawer(client = null, { onSaved } = {}) {
  const c = client || { company: '', contactName: '', email: '', phone: '', address: '', vatNumber: '', website: '', notes: '', tags: [], sourceId: null, custom: {} };
  const tags = lib('tags');
  const sources = lib('sources');
  const fields = lib('clientFields');

  drawer({
    title: client ? 'Edit client' : 'New client',
    submitLabel: client ? 'Save' : 'Create client',
    body: html`<div class="stack">
      <div class="grid">
        ${f.text('company', 'Company', c.company, { placeholder: 'Khumalo Projects (Pty) Ltd' })}
        <div class="grid g2">
          ${f.text('contactName', 'Contact name', c.contactName, { placeholder: 'Thandiwe Khumalo' })}
          ${f.text('email', 'Email', c.email, { type: 'email', placeholder: 'thandiwe@khumaloprojects.co.za' })}
          ${f.text('phone', 'Phone', c.phone, { type: 'tel', placeholder: '+27 82 555 0143' })}
          ${f.text('website', 'Website', c.website, { placeholder: 'khumaloprojects.co.za' })}
        </div>
        ${f.textarea('address', 'Address', c.address, { rows: 3, placeholder: '14 Meridian Drive\nUmhlanga Ridge\n4319' })}
        <div class="grid g2">
          ${f.text('vatNumber', 'VAT number', c.vatNumber, { placeholder: '4123456789' })}
          ${f.select('sourceId', 'Source', c.sourceId || '', sources.map((s) => ({ value: s.id, label: s.label })), { empty: 'Unknown' })}
        </div>
        ${tags.length ? html`<div class="field"><span class="label">Tags</span><div class="chips">
          ${tags.map((t) => html`<label class="chip chip-check"><input type="checkbox" name="tag" value="${t.id}"${attr((c.tags || []).includes(t.id), 'checked')}>${t.label}</label>`)}
        </div></div>` : ''}
      </div>
      ${fields.length ? f.group('Additional fields', html`<div class="grid g2">${fields.map((d) => customField(d, c.custom?.[d.id]))}</div>`) : ''}
      ${f.textarea('notes', 'Notes', c.notes, { rows: 3 })}
    </div>`,
    onSubmit: async (form) => {
      const v = f.readForm(form);
      if (!v.company && !v.contactName) { toast('Enter a company or contact name.', { error: true }); return false; }
      const custom = {};
      for (const d of fields) {
        const raw = v[`custom.${d.id}`];
        if (raw !== '' && raw != null) custom[d.id] = raw;
      }
      const data = {
        company: v.company, contactName: v.contactName, email: v.email, phone: v.phone, website: v.website,
        address: v.address, vatNumber: v.vatNumber, sourceId: v.sourceId || null, notes: v.notes,
        tags: [...form.querySelectorAll('input[name="tag"]:checked')].map((x) => x.value),
        custom: { ...(c.custom || {}), ...custom },
      };
      try {
        if (client) {
          await update('clients', client.id, data);
          await logClient(client.id, 'edited');
          toast('Client saved.');
          onSaved?.(client.id);
        } else {
          const id = await create('clients', data);
          await logClient(id, 'created');
          toast('Client created.');
          onSaved?.(id);
        }
      } catch (e) {
        toastError(e, 'Could not save the client.');
        return false;
      }
      return true;
    },
  });
}

export const clientName = (c) => c?.company || c?.contactName || 'Unnamed client';
export const tagLabel = (id) => (state.libraries.tags || []).find((t) => t.id === id)?.label;
