import { html, el } from '../lib/html.js';

let host;

function ensureHost() {
  if (!host) {
    host = el('<div class="toasts" role="status" aria-live="polite"></div>');
    document.body.append(host);
  }
  return host;
}

// toast('Client saved.') or toast('Quote deleted.', { undo: () => restore() })
export function toast(message, { undo, error = false, duration } = {}) {
  const node = el(html`<div class="toast${error ? ' err' : ''}"><span>${message}</span>${undo ? html`<button type="button">Undo</button>` : ''}</div>`);
  ensureHost().append(node);
  requestAnimationFrame(() => node.classList.add('open'));

  const close = () => {
    node.classList.remove('open');
    setTimeout(() => node.remove(), 200);
  };
  const timer = setTimeout(close, duration ?? (undo ? 6000 : error ? 6000 : 3000));

  if (undo) {
    node.querySelector('button').addEventListener('click', async () => {
      clearTimeout(timer);
      close();
      try {
        await undo();
        toast('Undone.');
      } catch (e) {
        toast('Could not undo.', { error: true });
      }
    });
  }
  return close;
}

export function toastError(e, fallback = 'Something went wrong.') {
  console.error(e);
  const msg = e?.code === 'permission-denied' ? 'Permission denied. Sign in again.' : fallback;
  toast(msg, { error: true });
}
