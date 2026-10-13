import { html } from '../lib/html.js';
import { state, saveLibrary } from '../data/store.js';
import { icon } from '../ui/icons.js';
import { empty, kebab } from '../ui/blocks.js';
import { drawer, menu, confirm, modal } from '../ui/overlay.js';
import { sortable } from '../ui/sortable.js';
import * as f from '../ui/fields.js';
import { toast, toastError } from '../ui/toast.js';
import { clone, move, uid } from '../lib/util.js';

// Lifecycle roles are behaviour, not wording: automation (numbering, expiry, revisions,
// dashboard counts) keys off the role, while labels and extra statuses stay editable.
const ROLES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'expired', label: 'Expired' },
  { value: 'superseded', label: 'Superseded' },
  { value: 'custom', label: 'Custom (no automation)' },
];
const SCOPE_KINDS = [
  { value: 'included', label: 'Included' },
  { value: 'excluded', label: 'Not included' },
  { value: 'assumptions', label: 'Assumptions' },
];
const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select' },
];

const usage = {
  statuses: (it) => [...state.quotes.values()].filter((q) => q.status === it.id).length,
  tags: (it) => [...state.clients.values()].filter((c) => (c.tags || []).includes(it.id)).length,
  sources: (it) => [...state.clients.values()].filter((c) => c.sourceId === it.id).length,
  clientFields: (it) => [...state.clients.values()].filter((c) => c.custom?.[it.id] != null && c.custom[it.id] !== '').length,
};

export const LIBRARY_DEFS = {
  statuses: {
    title: 'Quote statuses', noun: 'status',
    desc: 'Rename or add statuses. The role decides what the system does with a status.',
    primary: (it) => it.label, secondary: (it) => ROLES.find((r) => r.value === it.role)?.label,
    form: (it) => html`<div class="grid">${f.text('label', 'Label', it.label)}${f.select('role', 'Role', it.role || 'custom', ROLES)}</div>`,
    read: (v) => ({ label: v.label, role: v.role }),
    valid: (v) => !!v.label,
    blank: () => ({ label: '', role: 'custom' }),
  },
  paymentTemplates: {
    title: 'Payment schedule templates', noun: 'template',
    desc: 'Milestones as percentages of the once-off total.',
    primary: (it) => it.label, secondary: (it) => (it.milestones || []).map((m) => `${m.percent}%`).join(' / '),
    form: (it) => html`<div class="stack">${f.text('label', 'Name', it.label, { placeholder: '50 / 40 / 10' })}
      <div class="stack-sm"><div class="btn-row"><span class="label grow">Milestones</span><button type="button" class="btn btn-sm" data-add-ms>${icon('plus')}Milestone</button></div>
      <div class="milestones" data-ms-list>${(it.milestones || []).map(msRow)}</div></div></div>`,
    onOpen: (form) => {
      form.addEventListener('click', (e) => {
        if (e.target.closest('[data-add-ms]')) form.querySelector('[data-ms-list]').insertAdjacentHTML('beforeend', String(msRow({ label: '', percent: 0 })));
        const rm = e.target.closest('[data-rm-ms]');
        if (rm) rm.closest('.ms-row').remove();
      });
    },
    read: (v, form) => ({
      label: v.label,
      milestones: [...form.querySelectorAll('.ms-row')].map((r) => ({ label: r.querySelector('[data-f="label"]').value.trim(), percent: Number(r.querySelector('[data-f="percent"]').value) || 0 })).filter((m) => m.label || m.percent),
    }),
    valid: (v, data) => {
      if (!v.label) return 'Enter a name.';
      const sum = data.milestones.reduce((n, m) => n + m.percent, 0);
      return sum === 100 || `Milestones add up to ${sum}%, not 100%.`;
    },
    blank: () => ({ label: '', milestones: [{ label: 'Deposit on acceptance', percent: 50 }, { label: 'On launch', percent: 50 }] }),
  },
  terms: {
    title: 'Terms clauses', noun: 'clause',
    desc: 'Clauses switched on by default are added to new quotes.',
    primary: (it) => it.title, secondary: (it) => (it.defaultOn ? 'On by default' : 'Off by default'),
    form: (it) => html`<div class="grid">${f.text('title', 'Title', it.title)}${f.textarea('body', 'Text', it.body, { rows: 6 })}${f.check('defaultOn', 'Add to new quotes by default', it.defaultOn)}</div>`,
    read: (v) => ({ title: v.title, body: v.body, defaultOn: v.defaultOn }),
    valid: (v) => !!v.title,
    blank: () => ({ title: '', body: '', defaultOn: true }),
  },
  scopeTemplates: {
    title: 'Scope templates', noun: 'template',
    desc: 'Lines for the included, not included and assumptions lists on a quote.',
    primary: (it) => it.text, secondary: (it) => `${SCOPE_KINDS.find((k) => k.value === it.kind)?.label}${it.defaultOn ? ' · on by default' : ''}`,
    form: (it) => html`<div class="grid">${f.select('kind', 'List', it.kind, SCOPE_KINDS)}${f.textarea('text', 'Text', it.text, { rows: 3 })}${f.check('defaultOn', 'Add to new quotes by default', it.defaultOn)}</div>`,
    read: (v) => ({ kind: v.kind, text: v.text, defaultOn: v.defaultOn }),
    valid: (v) => !!v.text,
    blank: () => ({ kind: 'included', text: '', defaultOn: false }),
  },
  tags: {
    title: 'Client tags', noun: 'tag',
    primary: (it) => it.label,
    form: (it) => f.text('label', 'Label', it.label),
    read: (v) => ({ label: v.label }),
    valid: (v) => !!v.label,
    blank: () => ({ label: '' }),
  },
  sources: {
    title: 'Client sources', noun: 'source',
    desc: 'How clients found you.',
    primary: (it) => it.label,
    form: (it) => f.text('label', 'Label', it.label),
    read: (v) => ({ label: v.label }),
    valid: (v) => !!v.label,
    blank: () => ({ label: '' }),
  },
  clientFields: {
    title: 'Custom client fields', noun: 'field',
    desc: 'Extra fields on every client record.',
    primary: (it) => it.label, secondary: (it) => `${FIELD_TYPES.find((t) => t.value === it.type)?.label}${it.type === 'select' ? `: ${(it.options || []).join(', ')}` : ''}`,
    form: (it) => html`<div class="grid">${f.text('label', 'Label', it.label, { placeholder: 'Industry' })}${f.select('type', 'Type', it.type, FIELD_TYPES)}
      ${f.textarea('options', 'Options', (it.options || []).join('\n'), { rows: 4, hint: 'one per line, for Select' })}</div>`,
    read: (v) => ({ label: v.label, type: v.type, options: v.type === 'select' ? v.options.split('\n').map((x) => x.trim()).filter(Boolean) : [] }),
    valid: (v) => !!v.label,
    blank: () => ({ label: '', type: 'text', options: [] }),
  },
};

function msRow(m) {
  return html`<div class="ms-row">
    <input class="input" data-f="label" value="${m.label}" placeholder="Milestone" aria-label="Milestone">
    <div class="affix"><input class="input num" data-f="percent" type="number" min="0" step="1" value="${m.percent}" aria-label="Percent"><span class="post">%</span></div>
    <span class="ms-amt"></span>
    <button type="button" class="icon-btn" data-rm-ms aria-label="Remove">${icon('x')}</button></div>`;
}

export function renderLibrary(host, name) {
  const def = LIBRARY_DEFS[name];
  const items = () => clone(state.libraries[name] || []);
  const save = async (next, message, undoTo) => {
    try {
      await saveLibrary(name, next);
      toast(message, undoTo ? { undo: () => saveLibrary(name, undoTo) } : {});
    } catch (e) { toastError(e); }
  };

  const draw = () => {
    const list = items();
    host.innerHTML = String(html`
      <div class="panel">
        <div class="panel-head"><div><h2>${def.title}</h2>${def.desc ? html`<div class="desc">${def.desc}</div>` : ''}</div>
          <div class="btn-row"><button type="button" class="btn btn-sm" data-lib-add>${icon('plus')}Add ${def.noun}</button></div></div>
        ${list.length ? html`<table class="table"><tbody data-lib-body>${list.map((it) => html`
          <tr data-sort-id="${it.id}" class="${it.visible === false ? 'is-hidden' : ''}">
            <td class="td-handle"><span class="handle" data-handle aria-label="Drag to reorder">${icon('grip')}</span></td>
            <td class="link" data-lib-edit="${it.id}"><div class="primary">${def.primary(it)}${it.visible === false ? html` <span class="badge">Hidden</span>` : ''}</div>${def.secondary ? html`<div class="sub">${def.secondary(it) || ''}</div>` : ''}</td>
            <td class="actions">${kebab('lib-menu', it.id)}</td>
          </tr>`)}</tbody></table>`
          : empty(`No ${def.noun}s yet.`, { label: `Add ${def.noun}`, action: 'lib-add' })}
      </div>`);
    const body = host.querySelector('[data-lib-body]');
    if (body) {
      sortable(body, {
        onReorder: (id, to) => {
          const before = items();
          const from = before.findIndex((x) => x.id === id);
          save(move(before, from, to), 'Order saved.');
        },
      });
    }
  };

  const edit = (item) => {
    const it = item || { id: uid(10), visible: true, ...def.blank() };
    drawer({
      title: item ? `Edit ${def.noun}` : `New ${def.noun}`,
      submitLabel: item ? 'Save' : 'Add',
      body: def.form(it),
      onOpen: def.onOpen,
      onSubmit: async (form) => {
        const v = f.readForm(form);
        const data = def.read(v, form);
        const ok = def.valid(v, data);
        if (ok !== true) { toast(typeof ok === 'string' ? ok : 'Fill in the required fields.', { error: true }); return false; }
        const before = items();
        const next = item ? before.map((x) => (x.id === it.id ? { ...x, ...data } : x)) : [...before, { ...it, ...data }];
        await save(next, item ? 'Saved.' : 'Added.');
        return true;
      },
    });
  };

  const remove = async (it) => {
    const before = items();
    const used = usage[name]?.(it) || 0;
    if (name === 'statuses' && it.role !== 'custom' && before.filter((s) => s.role === it.role).length === 1) {
      const m = modal({
        label: 'Status needed',
        body: html`<div class="modal-body"><h2>This status is needed</h2><p>${it.label} is the only status with the ${it.role} role. Rename it instead, or add another ${it.role} status first.</p></div>`,
        foot: html`<button type="button" class="btn btn-primary" data-ok>OK</button>`,
      });
      m.node.querySelector('[data-ok]').addEventListener('click', () => m.close());
      return;
    }
    if (used) {
      toast(`In use ${used} ${used === 1 ? 'time' : 'times'}. Hide it instead.`, { error: true });
      return;
    }
    if (!(await confirm({ title: `Delete ${def.primary(it)}?`, confirmLabel: 'Delete', danger: true }))) return;
    save(before.filter((x) => x.id !== it.id), 'Deleted.', before);
  };

  host.onclick = (e) => {
    if (e.target.closest('[data-lib-add], [data-action="lib-add"]')) { edit(null); return; }
    const ed = e.target.closest('[data-lib-edit]');
    if (ed) { edit(items().find((x) => x.id === ed.dataset.libEdit)); return; }
    const mb = e.target.closest('[data-action="lib-menu"]');
    if (mb) {
      const it = items().find((x) => x.id === mb.dataset.id);
      menu(mb, [
        { label: 'Edit', icon: 'edit', onSelect: () => edit(it) },
        { label: 'Duplicate', icon: 'copy', onSelect: () => {
          const before = items();
          const copy = { ...clone(it), id: uid(10) };
          if ('label' in copy) copy.label = `${copy.label} copy`;
          if ('title' in copy) copy.title = `${copy.title} copy`;
          before.splice(before.findIndex((x) => x.id === it.id) + 1, 0, copy);
          save(before, 'Duplicated.');
        } },
        { label: it.visible === false ? 'Show' : 'Hide', icon: it.visible === false ? 'eye' : 'eyeOff', onSelect: () => {
          const before = items();
          save(before.map((x) => (x.id === it.id ? { ...x, visible: x.visible === false } : x)), it.visible === false ? 'Shown.' : 'Hidden.', before);
        } },
        'sep',
        { label: 'Delete', icon: 'trash', danger: true, onSelect: () => remove(it) },
      ]);
    }
  };

  draw();
  return draw;
}

