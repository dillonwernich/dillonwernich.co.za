// Creates the owner account in the Auth emulator (UID must match the rules).
// Usage, with emulators running: node tests/emulator-user.js
import { readFileSync } from 'node:fs';

const user = JSON.parse(readFileSync(new URL('./fixtures/emulator-owner.json', import.meta.url)));
const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/dillon-wernich/accounts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
  body: JSON.stringify({ localId: user.localId, email: user.email, password: user.password }),
});
console.log(res.status, res.ok ? `created ${user.email}` : await res.text());
