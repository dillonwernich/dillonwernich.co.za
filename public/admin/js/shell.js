import { html, mount } from './lib/html.js';
import { icon } from './ui/icons.js';
import { isMac } from './lib/util.js';

export const NAV = [
  { href: '/admin/', label: 'Dashboard', icon: 'dashboard', match: /^\/admin\/$/ },
  { href: '/admin/quotes/', label: 'Quotes', icon: 'quotes', match: /^\/admin\/quotes\// },
  { href: '/admin/clients/', label: 'Clients', icon: 'clients', match: /^\/admin\/clients\// },
  { href: '/admin/pricing/', label: 'Pricing', icon: 'pricing', match: /^\/admin\/pricing\// },
  { href: '/admin/files/', label: 'Files', icon: 'files', match: /^\/admin\/files\// },
  { href: '/admin/settings/', label: 'Settings', icon: 'settings', match: /^\/admin\/settings\// },
];

const TABS = ['/admin/', '/admin/quotes/', '/admin/clients/', '/admin/files/', '/admin/settings/'];

let refs = null;

function collapsed() {
  try { return localStorage.getItem('dw-sidebar') === 'collapsed'; } catch { return false; }
}

export function renderShell(root, { onPalette, onSignOut }) {
  mount(root, html`
    <div class="shell${collapsed() ? ' collapsed' : ''}">
      <aside class="sidebar" aria-label="Admin">
        <div class="side-head">
          <a class="side-brand" href="/admin/">Dillon Wernich</a>
          <button type="button" class="icon-btn" data-collapse aria-label="Collapse sidebar">${icon('panel')}</button>
        </div>
        <nav class="side-nav">
          ${NAV.map((n) => html`<a class="side-link" href="${n.href}" data-nav="${n.href}" title="${n.label}">${icon(n.icon)}<span class="side-label">${n.label}</span></a>`)}
        </nav>
        <div class="side-foot">
          <button type="button" class="side-link" data-palette title="Search">${icon('search')}<span class="side-label">Search</span><span class="side-kbd">${isMac ? '⌘K' : 'Ctrl K'}</span></button>
          <button type="button" class="side-link" data-signout title="Sign out">${icon('logout')}<span class="side-label">Sign out</span></button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <h1 data-title></h1>
          <span class="top-meta" data-meta></span>
          <div class="top-actions" data-actions></div>
          <button type="button" class="icon-btn show-sm" data-palette aria-label="Search">${icon('search')}</button>
        </header>
        <main class="content" data-content tabindex="-1"></main>
      </div>
      <nav class="tabbar" aria-label="Sections">
        ${NAV.filter((n) => TABS.includes(n.href)).map((n) => html`<a class="tab" href="${n.href}" data-nav="${n.href}">${icon(n.icon)}<span>${n.label}</span></a>`)}
      </nav>
    </div>`);

  const shellEl = root.querySelector('.shell');
  refs = {
    shell: shellEl,
    title: root.querySelector('[data-title]'),
    meta: root.querySelector('[data-meta]'),
    actions: root.querySelector('[data-actions]'),
    content: root.querySelector('[data-content]'),
  };

  root.querySelector('[data-collapse]').addEventListener('click', () => {
    shellEl.classList.toggle('collapsed');
    try { localStorage.setItem('dw-sidebar', shellEl.classList.contains('collapsed') ? 'collapsed' : 'open'); } catch { /* storage unavailable */ }
  });
  root.querySelectorAll('[data-palette]').forEach((b) => b.addEventListener('click', onPalette));
  root.querySelector('[data-signout]').addEventListener('click', onSignOut);
  return refs;
}

export function setActiveNav(pathname) {
  const active = NAV.find((n) => n.match.test(pathname));
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (active && a.dataset.nav === active.href) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

// Screens call this to set the top bar. crumb: { href, label } shown before the title.
export function header({ title, crumb, meta = '', actions = '' }) {
  refs.title.innerHTML = String(crumb
    ? html`<span class="crumb"><a href="${crumb.href}">${crumb.label}</a> / </span>${title}`
    : html`${title}`);
  refs.meta.innerHTML = String(meta);
  refs.actions.innerHTML = String(actions);
  document.title = `${title} · Admin`;
  return refs.actions;
}

export const setMeta = (markup) => { refs.meta.innerHTML = String(markup); };
export const content = () => refs.content;
export const shellRefs = () => refs;
