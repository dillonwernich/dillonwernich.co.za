import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getStorage, connectStorageEmulator } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';

// Must match ownerUid() in firestore.rules and storage.rules. The rules are the real
// gate; this only lets the UI refuse early instead of showing permission errors.
export const OWNER_UID = 'U8SYctoCDlVkSrhNYO2c033lrcU2';

const config = {
  apiKey: 'AIzaSyDyTl8omzJJV-1ISIS0A34wpgu9aNsAQYQ',
  authDomain: 'dillon-wernich.firebaseapp.com',
  projectId: 'dillon-wernich',
  storageBucket: 'dillon-wernich.firebasestorage.app',
  messagingSenderId: '915315770987',
  appId: '1:915315770987:web:7b96d225a993c842f4932e',
};

export const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

export const app = initializeApp(config);
export const auth = getAuth(app);
// Offline cache keeps the admin usable on a patchy mobile connection.
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: isLocal ? undefined : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const storage = getStorage(app);

if (isLocal) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
