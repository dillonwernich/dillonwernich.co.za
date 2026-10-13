import { html, attr, raw } from '../lib/html.js';
import { centsToInput } from '../lib/format.js';

// Shared field markup so every form in the admin renders identically.

const id = (name) => `f-${name.replace(/[^a-z0-9_-]/gi, '-')}`;

function wrap(name, label, hint, control, cls = '') {
  return html`<div class="field ${cls}">
    <label class="label" for="${id(name)}">${label}${hint ? html` <span class="hint">${hint}</span>` : ''}</label>
    ${control}
  </div>`;
}

export function text(name, label, value = '', { hint, placeholder, type = 'text', required, cls, autocomplete, inputmode } = {}) {
  return wrap(name, label, hint, html`<input class="input" id="${id(name)}" name="${name}" type="${type}" value="${value ?? ''}"
    ${attr(placeholder, 'placeholder', placeholder)}${attr(required, 'required')}${attr(autocomplete, 'autocomplete', autocomplete)}${attr(inputmode, 'inputmode', inputmode)}>`, cls);
}

export function number(name, label, value = '', { hint, step = 'any', min, cls, suffix, prefix } = {}) {
  const input = html`<input class="input num" id="${id(name)}" name="${name}" type="number" inputmode="decimal" step="${step}" value="${value ?? ''}"${attr(min != null, 'min', min)}>`;
  return wrap(name, label, hint, affix(input, prefix, suffix), cls);
}

export function moneyField(name, label, cents = 0, { hint, cls } = {}) {
  const input = html`<input class="input num" id="${id(name)}" name="${name}" type="text" inputmode="decimal" value="${centsToInput(cents)}" data-money>`;
  return wrap(name, label, hint, affix(input, 'R'), cls);
}

function affix(input, prefix, suffix) {
  if (!prefix && !suffix) return input;
  return html`<div class="affix">${prefix ? html`<span class="pre">${prefix}</span>` : ''}${input}${suffix ? html`<span class="post">${suffix}</span>` : ''}</div>`;
}

export function textarea(name, label, value = '', { hint, rows = 4, placeholder, cls } = {}) {
  return wrap(name, label, hint, html`<textarea class="textarea" id="${id(name)}" name="${name}" rows="${rows}"${attr(placeholder, 'placeholder', placeholder)}>${value ?? ''}</textarea>`, cls);
}

// options: [{ value, label }]
export function select(name, label, value, options, { hint, empty, cls } = {}) {
  return wrap(name, label, hint, html`<select class="select" id="${id(name)}" name="${name}">
    ${empty != null ? html`<option value="">${empty}</option>` : ''}
    ${options.map((o) => html`<option value="${o.value}"${attr(String(o.value) === String(value ?? ''), 'selected')}>${o.label}</option>`)}
  </select>`, cls);
}

export function check(name, label, checked, { hint } = {}) {
  return html`<label class="check"><input type="checkbox" name="${name}"${attr(checked, 'checked')}><span>${label}${hint ? html` <span class="faint">${hint}</span>` : ''}</span></label>`;
}

export function date(name, label, value = '', opts = {}) {
  return text(name, label, value, { ...opts, type: 'date' });
}

export const group = (title, body, desc) => html`<div class="stack-sm">
  <div><div class="section-title">${title}</div>${desc ? html`<div class="desc">${desc}</div>` : ''}</div>${body}</div>`;

export const row = (...cols) => html`<div class="grid g2">${cols}</div>`;

export function readForm(form) {
  const out = {};
  for (const elm of form.elements) {
    if (!elm.name || elm.disabled) continue;
    if (elm.type === 'checkbox') out[elm.name] = elm.checked;
    else if (elm.type === 'number') out[elm.name] = elm.value === '' ? null : Number(elm.value);
    else out[elm.name] = elm.value.trim();
  }
  return out;
}

export const hidden = (name, value) => raw(`<input type="hidden" name="${name}" value="${String(value ?? '').replace(/"/g, '&quot;')}">`);
