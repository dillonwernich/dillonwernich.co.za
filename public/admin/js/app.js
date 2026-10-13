import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getDoc, doc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth, db, OWNER_UID } from './firebase.js';
import { init, teardown, on, state } from './data/store.js';
import { renderShell, setActiveNav, header, content } from './shell.js';
import { route, start, setGuard } from './router.js';
import { renderLogin } from './screens/login.js';
import { bindPaletteKey, openPalette } from './ui/palette.js';
import { skeletonBlock } from './ui/blocks.js';
import { toastError } from './ui/toast.js';
import { closeAll } from './ui/overlay.js';
import { applyTheme } from './theme.js';
import { expireQuotes } from './screens/quote-lifecycle.js';

const root = document.getElementById('app');

route('/admin/', () => import('./screens/dashboard.js'));
route('/admin/quotes/', () => import('./screens/quotes.js'));
route('/admin/quotes/new/', () => import('./screens/quote-builder.js'));
route('/admin/quotes/:id/print/', () => import('./screens/quote-print.js'));
route('/admin/quotes/:id/', () => import('./screens/quote-builder.js'));
route('/admin/clients/', () => import('./screens/clients.js'));
route('/admin/clients/:id/', () => import('./screens/client-detail.js'));
route('/admin/pricing/', () => import('./screens/pricing.js'));
route('/admin/files/', () => import('./screens/files.js'));
route('/admin/settings/', () => import('./screens/settings.js'));

let cleanup = null;
let started = false;
let renderSeq = 0;

async function show(r, params) {
  const seq = ++renderSeq;
  cleanup?.();
  cleanup = null;
  closeAll();
  setActiveNav(location.pathname);
  const el = content();
  el.className = 'content';
  el.innerHTML = String(skeletonBlock());
  header({ title: '' });
  try {
    const mod = await r.load();
    if (seq !== renderSeq) return;
    el.innerHTML = '';
    const disposers = [];
    const view = {
      el,
      params,
      header,
      guard: setGuard,
      // Re-run `fn` whenever any of the named store collections change.
      watch(names, fn) {
        disposers.push(on((what) => { if (names.includes(what)) fn(what); }));
      },
      onCleanup(fn) { disposers.push(fn); },
    };
    await mod.default(view);
    cleanup = () => disposers.splice(0).forEach((d) => d());
    el.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (e) {
    toastError(e, 'This screen could not load.');
  }
}

// A session is valid only if it started after the last "sign out everywhere".
async function sessionRevoked(user) {
  const snap = await getDoc(doc(db, 'settings', 'security'));
  const validAfter = snap.data()?.validAfter;
  if (!validAfter) return false;
  const token = await user.getIdTokenResult();
  return Number(token.claims.auth_time) <= validAfter;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    teardown();
    started = false;
    renderLogin(root);
    return;
  }
  if (user.uid !== OWNER_UID) {
    await signOut(auth);
    renderLogin(root, { error: 'This account does not have access.' });
    return;
  }
  try {
    if (await sessionRevoked(user)) {
      await signOut(auth);
      renderLogin(root, { error: 'This session was signed out. Sign in again.' });
      return;
    }
    root.innerHTML = '<div class="boot">Loading.</div>';
    await init();
    applyTheme(state.settings.appearance?.theme);
    on((what) => { if (what === 'settings.appearance') applyTheme(state.settings.appearance?.theme); });
    expireQuotes().catch((e) => console.error('expiry', e));

    renderShell(root, {
      onPalette: openPalette,
      onSignOut: () => signOut(auth),
    });
    if (!started) {
      started = true;
      bindPaletteKey();
    }
    await start(show);
  } catch (e) {
    console.error(e);
    if (e?.code === 'permission-denied') {
      await signOut(auth);
      renderLogin(root, { error: 'Access was refused. Sign in again.' });
    } else {
      root.innerHTML = '<div class="boot">Could not load. Check your connection and reload.</div>';
    }
  }
});
