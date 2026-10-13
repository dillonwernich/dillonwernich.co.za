// Theme follows the system unless set in Settings → Appearance. Mirrored to
// localStorage only so the next load paints in the right theme before Firestore answers.
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  try { localStorage.setItem('dw-theme', theme || 'system'); } catch { /* storage unavailable */ }
}
