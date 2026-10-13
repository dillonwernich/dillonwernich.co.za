import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { auth } from '../firebase.js';
import { html, mount } from '../lib/html.js';
import * as f from '../ui/fields.js';

const MESSAGES = {
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'auth/network-request-failed': 'No connection. Check your network and try again.',
};

export function renderLogin(root, { error = '' } = {}) {
  document.title = 'Sign in · Admin';
  mount(root, html`
    <div class="login">
      <form class="login-box" novalidate>
        <div class="login-brand">Dillon Wernich</div>
        <div class="login-sub">Admin</div>
        ${f.text('email', 'Email', '', { type: 'email', autocomplete: 'username', required: true })}
        ${f.text('password', 'Password', '', { type: 'password', autocomplete: 'current-password', required: true })}
        <button type="submit" class="btn btn-primary">Sign in</button>
        <div class="login-err" role="alert">${error}</div>
        <button type="button" class="btn btn-ghost btn-sm login-reset" data-reset>Reset password</button>
      </form>
    </div>`);

  const form = root.querySelector('form');
  const err = root.querySelector('.login-err');
  const btn = form.querySelector('[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { email, password } = f.readForm(form);
    if (!email || !password) { err.textContent = 'Enter your email and password.'; return; }
    btn.disabled = true;
    err.textContent = '';
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (ex) {
      err.textContent = MESSAGES[ex.code] || 'Could not sign in.';
      btn.disabled = false;
    }
  });

  root.querySelector('[data-reset]').addEventListener('click', async () => {
    const { email } = f.readForm(form);
    if (!email) { err.textContent = 'Enter your email first, then reset.'; return; }
    try {
      await sendPasswordResetEmail(auth, email);
      err.textContent = 'If that address has an account, a reset link is on its way.';
    } catch (ex) {
      err.textContent = MESSAGES[ex.code] || 'Could not send the reset email.';
    }
  });
}
