// Runs before first paint (classic script, not a module) so the saved theme applies
// without a flash. Kept in a file so the admin CSP needs no inline-script allowance.
try {
  var t = localStorage.getItem('dw-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) { /* storage unavailable */ }
