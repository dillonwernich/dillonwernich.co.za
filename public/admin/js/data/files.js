import { ref, uploadBytesResumable, getDownloadURL, deleteObject, getBlob } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';
import { storage } from '../firebase.js';
import { state, create, update, remove, now, logQuote, logClient } from './store.js';
import { uid } from '../lib/util.js';

// Bytes live in Storage at files/{fileId}/{name}; everything else (folder, links,
// display name, trash) lives in Firestore, so moving or renaming never copies bytes.

const safeName = (name) => String(name || 'file').replace(/[/\\?%*:|"<>#\u0000-\u001f]/g, '-').slice(0, 180);

export function maxBytes() {
  return (Number(state.settings.quoteDefaults?.maxUploadMB) || 25) * 1024 * 1024;
}

export function uploadFile(blob, { name, folderId = null, clientId = null, quoteId = null, contentType }, onProgress) {
  const fileId = uid(20);
  const clean = safeName(name);
  const path = `files/${fileId}/${clean}`;
  const task = uploadBytesResumable(ref(storage, path), blob, {
    contentType: contentType || blob.type || 'application/octet-stream',
    contentDisposition: `inline; filename="${clean.replace(/"/g, '')}"`,
  });
  const done = new Promise((resolve, reject) => {
    task.on('state_changed',
      (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
      reject,
      async () => {
        try {
          await create('files', {
            name: clean, path, size: blob.size, type: contentType || blob.type || 'application/octet-stream',
            folderId, clientId, quoteId, deletedAt: null,
          }, fileId);
          if (quoteId) await logQuote(quoteId, 'file', `File attached: ${clean}`);
          if (clientId) await logClient(clientId, 'file', `File attached: ${clean}`);
          resolve(fileId);
        } catch (e) { reject(e); }
      });
  });
  return { task, done, fileId };
}

const urlCache = new Map();
export async function fileUrl(file) {
  if (!urlCache.has(file.path)) urlCache.set(file.path, await getDownloadURL(ref(storage, file.path)));
  return urlCache.get(file.path);
}

export async function downloadFile(file) {
  const blob = await getBlob(ref(storage, file.path));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const trashFile = (file) => update('files', file.id, { deletedAt: now() });
export const restoreFile = (file) => update('files', file.id, { deletedAt: null });

export async function destroyFile(file) {
  try {
    await deleteObject(ref(storage, file.path));
  } catch (e) {
    if (e.code !== 'storage/object-not-found') throw e;
  }
  await remove('files', file.id);
}

// Finds or creates a top-level folder by name, e.g. "Quotes" for saved quote snapshots.
export async function ensureFolder(name) {
  const found = [...state.folders.values()].find((f) => !f.parentId && f.name === name);
  if (found) return found.id;
  return create('folders', { name, parentId: null });
}
