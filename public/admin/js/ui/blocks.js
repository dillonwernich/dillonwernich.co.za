import { html } from '../lib/html.js';
import { icon } from './icons.js';

// Empty states: one sentence, one action.
export function empty(sentence, action) {
  return html`<div class="empty"><p>${sentence}</p>${action ? html`<button type="button" class="btn" data-action="${action.action}">${action.icon ? icon(action.icon) : ''}${action.label}</button>` : ''}</div>`;
}

export function skeletonTable(cols = 4, rows = 6) {
  const widths = ['60%', '40%', '30%', '50%', '25%', '35%'];
  return html`<div class="table-wrap"><table class="table"><thead><tr>${Array.from({ length: cols }, () => html`<th><span class="skel" style="width:60px;height:8px"></span></th>`)}</tr></thead>
    <tbody>${Array.from({ length: rows }, (_, r) => html`<tr>${Array.from({ length: cols }, (_, c) => html`<td><span class="skel" style="width:${widths[(r + c) % widths.length]}"></span></td>`)}</tr>`)}</tbody></table></div>`;
}

export function skeletonBlock(lines = 5) {
  return html`<div class="panel"><div class="panel-body stack-sm">${Array.from({ length: lines }, (_, i) => html`<span class="skel" style="width:${[70, 45, 85, 55, 65][i % 5]}%"></span>`)}</div></div>`;
}

export function statusBadge(status) {
  if (!status) return '';
  return html`<span class="badge role-${status.role || 'custom'}">${status.label}</span>`;
}

export const kebab = (action, id, label = 'More actions') =>
  html`<button type="button" class="icon-btn sm" data-action="${action}" data-id="${id}" aria-label="${label}">${icon('more')}</button>`;
