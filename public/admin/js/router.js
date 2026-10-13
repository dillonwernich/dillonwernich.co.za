import { confirm } from './ui/overlay.js';

// History-API router. Hosting rewrites /admin/** to the shell, so deep links work.

const routes = [];
let current = null;
let guard = null;
let onChange = () => {};
let bound = false;

export function route(pattern, load) {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  routes.push({ re, keys, load, pattern });
}

function match(pathname) {
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

// A screen with unsaved work registers a guard returning true while dirty.
export function setGuard(fn) {
  guard = fn;
}

async function allowLeave() {
  if (!guard || !guard()) return true;
  return confirm({ title: 'Leave without saving?', body: 'You have changes on this screen that have not been saved.', confirmLabel: 'Leave', danger: true });
}

export async function navigate(to, { replace = false, force = false } = {}) {
  const url = new URL(to, location.origin);
  if (!force && url.pathname + url.search === location.pathname + location.search) return;
  if (!force && !(await allowLeave())) return;
  guard = null;
  history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search + url.hash);
  await resolve();
}

async function resolve() {
  const found = match(location.pathname) || match('/admin/');
  const params = { ...found.params, query: Object.fromEntries(new URLSearchParams(location.search)) };
  current = { pattern: found.route.pattern, params, url: location.pathname + location.search };
  await onChange(found.route, params);
}

export function start(handler) {
  onChange = handler;
  if (bound) return resolve();
  bound = true;

  addEventListener('popstate', async () => {
    if (guard && guard() && !(await allowLeave())) {
      history.pushState({}, '', current?.url || '/admin/');
      return;
    }
    guard = null;
    resolve();
  });

  addEventListener('beforeunload', (e) => {
    if (guard && guard()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || a.target || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/admin/')) return;
    e.preventDefault();
    navigate(url.pathname + url.search);
  });

  return resolve();
}

export const currentRoute = () => current;
