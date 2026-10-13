import { html, attr } from '../lib/html.js';
import { bytes, date, dateTime } from '../lib/format.js';
import { state, create, update, remove } from '../data/store.js';
import { uploadFile, fileUrl, downloadFile, trashFile, restoreFile, destroyFile, maxBytes } from '../data/files.js';
import { icon } from '../ui/icons.js';
import { empty, kebab, skeletonTable } from '../ui/blocks.js';
import { drawer, menu, confirm } from '../ui/overlay.js';
import * as f from '../ui/fields.js';
import { toast, toastError } from '../ui/toast.js';
import { navigate } from '../router.js';
import { sortBy, matches } from '../lib/util.js';
import { clientName } from './client-form.js';

const TRASH = '__trash';
const ALL = '';

const kindOf = (file) => {
  if (file.type?.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'text/html') return 'html';
  return 'other';
};

export default function files(view) {
  const q = view.params.query;
  const ui = { folder: q.trash ? TRASH : q.folder || ALL, client: q.client || '', search: '' };
  const uploads = new Map();

  view.header({
    title: 'Files',
    actions: html`<button type="button" class="btn hide-sm" data-act="new-folder">${icon('plus')}Folder</button>
      <label class="btn btn-primary">${icon('upload')}Upload<input type="file" multiple hidden data-picker></label>`,
  });

  view.el.innerHTML = String(html`
    <div class="files-layout">
      <nav aria-label="Folders"><ul class="tree" data-tree></ul></nav>
      <div>
        <div class="dropzone" data-drop>Drop files here to upload${ui.client ? ' and attach them to this client' : ''}.</div>
        <div class="uploads" data-uploads></div>
        <div class="toolbar"><input class="input" type="search" placeholder="Search files" data-search aria-label="Search files"><span class="faint" data-scope></span></div>
        <div data-list>${skeletonTable(4)}</div>
      </div>
    </div>`);
  const $ = (s) => view.el.querySelector(s);

  const folders = () => [...state.folders.values()];
  const childrenOf = (pid) => sortBy(folders().filter((x) => (x.parentId || null) === (pid || null)), 'name');
  const folderPath = (id) => {
    const parts = [];
    let cur = state.folders.get(id);
    while (cur) { parts.unshift(cur.name); cur = state.folders.get(cur.parentId); }
    return parts.join(' / ');
  };
  const descendants = (id) => {
    const out = [id];
    for (const c of childrenOf(id)) out.push(...descendants(c.id));
    return out;
  };

  // ---------- tree ----------

  const drawTree = () => {
    const node = (fo) => html`<li>
      <a href="/admin/files/?folder=${fo.id}" data-folder="${fo.id}"${attr(ui.folder === fo.id, 'aria-current', 'page')}>${icon('folder')}<span class="grow">${fo.name}</span></a>
      ${childrenOf(fo.id).length ? html`<ul>${childrenOf(fo.id).map(node)}</ul>` : ''}</li>`;
    const trashCount = [...state.files.values()].filter((x) => x.deletedAt).length;
    $('[data-tree]').innerHTML = String(html`
      <li><a href="/admin/files/" data-folder=""${attr(ui.folder === ALL && !ui.client, 'aria-current', 'page')}>${icon('files')}<span class="grow">All files</span></a></li>
      ${childrenOf(null).map(node)}
      <li><a href="/admin/files/?trash=1" data-folder="${TRASH}"${attr(ui.folder === TRASH, 'aria-current', 'page')}>${icon('trash')}<span class="grow">Trash</span>${trashCount ? html`<span class="faint mono">${trashCount}</span>` : ''}</a></li>`);
  };

  // ---------- list ----------

  const visibleFiles = () => {
    let rows = [...state.files.values()];
    if (ui.folder === TRASH) rows = rows.filter((x) => x.deletedAt);
    else {
      rows = rows.filter((x) => !x.deletedAt);
      if (ui.client) rows = rows.filter((x) => x.clientId === ui.client);
      else if (ui.folder) rows = rows.filter((x) => x.folderId === ui.folder);
    }
    if (ui.search) rows = rows.filter((x) => matches(x.name, ui.search));
    return sortBy(rows, (x) => -(x.createdAt?.seconds || 0));
  };

  const drawList = () => {
    if (!state.loaded.has('files')) return;
    const client = ui.client ? state.clients.get(ui.client) : null;
    $('[data-scope]').textContent = client ? `Attached to ${clientName(client)}` : ui.folder && ui.folder !== TRASH ? folderPath(ui.folder) : '';
    const rows = visibleFiles();
    const subfolders = ui.folder && ui.folder !== TRASH && !ui.client && !ui.search ? childrenOf(ui.folder) : [];

    if (!rows.length && !subfolders.length) {
      $('[data-list]').innerHTML = String(html`<div class="panel">${ui.folder === TRASH
        ? html`<div class="empty"><p>Trash is empty.</p></div>`
        : empty(ui.search ? 'No files match.' : 'No files here yet.', ui.search ? null : { label: 'Upload files', action: 'upload', icon: 'upload' })}</div>`);
      return;
    }

    $('[data-list]').innerHTML = String(html`
      ${ui.folder === TRASH ? html`<div class="toolbar"><span class="faint grow">Files in Trash can be restored until you delete them forever.</span><button type="button" class="btn btn-danger btn-sm" data-act="empty-trash">Empty trash</button></div>` : ''}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Name</th><th class="col-opt">Linked to</th><th class="num">Size</th><th class="num col-opt">${ui.folder === TRASH ? 'Deleted' : 'Added'}</th><th></th></tr></thead>
        <tbody>
          ${subfolders.map((fo) => html`<tr class="link" data-open-folder="${fo.id}"><td><span class="primary">${icon('folder')} ${fo.name}</span></td><td class="col-opt"></td><td></td><td class="col-opt"></td><td class="actions">${kebab('folder-menu', fo.id, 'Folder actions')}</td></tr>`)}
          ${rows.map((x) => {
            const c = x.clientId ? state.clients.get(x.clientId) : null;
            const qt = x.quoteId ? state.quotes.get(x.quoteId) : null;
            return html`<tr class="link" data-file="${x.id}" draggable="${ui.folder !== TRASH}">
              <td><div class="primary">${icon(kindOf(x) === 'image' ? 'image' : 'file')} ${x.name}</div>${!ui.folder && x.folderId ? html`<div class="sub">${folderPath(x.folderId)}</div>` : ''}</td>
              <td class="col-opt">${[c ? clientName(c) : '', qt ? qt.number || qt.title : ''].filter(Boolean).join(' · ')}</td>
              <td class="num faint">${bytes(x.size)}</td>
              <td class="num col-opt faint">${date(ui.folder === TRASH ? x.deletedAt : x.createdAt)}</td>
              <td class="actions">${kebab('file-menu', x.id, 'File actions')}</td>
            </tr>`;
          })}
        </tbody></table></div>`);
  };

  const drawUploads = () => {
    $('[data-uploads]').innerHTML = String(html`${[...uploads.values()].map((u) => html`<div class="upload-row">
      <span>${u.name}</span><span class="bar"><i style="width:${Math.round(u.progress * 100)}%"></i></span><span class="num faint">${u.error ? 'Failed' : `${Math.round(u.progress * 100)}%`}</span></div>`)}`);
  };

  // ---------- actions ----------

  function upload(fileList) {
    const limit = maxBytes();
    for (const file of fileList) {
      if (file.size > limit) { toast(`${file.name} is over the ${Math.round(limit / 1024 / 1024)} MB limit.`, { error: true }); continue; }
      const key = `${file.name}-${Math.random()}`;
      uploads.set(key, { name: file.name, progress: 0 });
      drawUploads();
      const folderId = ui.folder && ui.folder !== TRASH ? ui.folder : null;
      const { done } = uploadFile(file, { name: file.name, folderId, clientId: ui.client || null }, (p) => {
        uploads.get(key).progress = p;
        drawUploads();
      });
      done.then(() => {
        uploads.delete(key);
        drawUploads();
        toast(`${file.name} uploaded.`);
      }).catch((e) => {
        uploads.get(key).error = true;
        drawUploads();
        toastError(e, `${file.name} could not upload.`);
        setTimeout(() => { uploads.delete(key); drawUploads(); }, 5000);
      });
    }
  }

  const folderOptions = (exclude = []) => {
    const out = [];
    const walk = (pid, depth) => {
      for (const fo of childrenOf(pid)) {
        if (exclude.includes(fo.id)) continue;
        out.push({ value: fo.id, label: `${'— '.repeat(depth)}${fo.name}` });
        walk(fo.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  };

  function folderDrawer(folder = null) {
    drawer({
      title: folder ? 'Rename folder' : 'New folder',
      submitLabel: folder ? 'Save' : 'Create folder',
      body: html`<div class="grid">${f.text('name', 'Name', folder?.name || '', { placeholder: 'Contracts' })}
        ${f.select('parentId', 'Inside', folder ? folder.parentId || '' : ui.folder && ui.folder !== TRASH ? ui.folder : '', folderOptions(folder ? descendants(folder.id) : []), { empty: 'Top level' })}</div>`,
      onSubmit: async (form) => {
        const v = f.readForm(form);
        if (!v.name) { toast('Enter a folder name.', { error: true }); return false; }
        try {
          if (folder) await update('folders', folder.id, { name: v.name, parentId: v.parentId || null });
          else await create('folders', { name: v.name, parentId: v.parentId || null });
          toast(folder ? 'Folder saved.' : 'Folder created.');
        } catch (e) { toastError(e); return false; }
        return true;
      },
    });
  }

  async function deleteFolder(folder) {
    const ids = descendants(folder.id);
    const inside = [...state.files.values()].filter((x) => ids.includes(x.folderId) && !x.deletedAt);
    if (!(await confirm({
      title: `Delete ${folder.name}?`,
      body: inside.length ? `${inside.length} ${inside.length === 1 ? 'file moves' : 'files move'} to the parent folder.` : 'The folder is empty.',
      confirmLabel: 'Delete', danger: true,
    }))) return;
    try {
      for (const x of inside) await update('files', x.id, { folderId: folder.parentId || null });
      for (const id of ids.reverse()) await remove('folders', id);
      if (ids.includes(ui.folder)) navigate('/admin/files/');
      toast('Folder deleted.');
    } catch (e) { toastError(e); }
  }

  async function fileDetails(file) {
    const kind = kindOf(file);
    let url = '';
    try { url = await fileUrl(file); } catch (e) { toastError(e, 'Preview unavailable.'); }
    const clients = sortBy([...state.clients.values()].filter((c) => !c.mergedInto), (c) => clientName(c));
    const quotes = sortBy([...state.quotes.values()], (x) => -(x.updatedAt?.seconds || 0));
    const preview = {
      image: html`<div class="preview"><img src="${url}" alt=""></div>`,
      pdf: html`<div class="preview"><iframe src="${url}" title="${file.name}"></iframe></div>`,
      html: html`<div class="preview"><iframe src="${url}" title="${file.name}" sandbox=""></iframe></div>`,
      other: html`<div class="preview"><div class="empty"><p>${file.type || 'Unknown type'} · ${bytes(file.size)}</p></div></div>`,
    }[kind];

    drawer({
      title: file.name,
      submitLabel: 'Save',
      extraFoot: html`<button type="button" class="btn left" data-download>${icon('download')}Download</button>`,
      body: html`<div class="stack">
        ${url ? preview : ''}
        <div class="grid">
          ${f.text('name', 'Name', file.name)}
          ${f.select('folderId', 'Folder', file.folderId || '', folderOptions(), { empty: 'No folder' })}
          <div class="grid g2">
            ${f.select('clientId', 'Client', file.clientId || '', clients.map((c) => ({ value: c.id, label: clientName(c) })), { empty: 'None' })}
            ${f.select('quoteId', 'Quote', file.quoteId || '', quotes.map((x) => ({ value: x.id, label: x.number ? `${x.number} · ${x.title}` : x.title || 'Untitled quote' })), { empty: 'None' })}
          </div>
          <p class="faint">${file.type || 'Unknown type'} · ${bytes(file.size)} · added ${dateTime(file.createdAt)}</p>
        </div>
      </div>`,
      onOpen: (form) => {
        form.querySelector('[data-download]').addEventListener('click', () => downloadFile(file).catch((e) => toastError(e, 'Download failed.')));
      },
      onSubmit: async (form) => {
        const v = f.readForm(form);
        try {
          await update('files', file.id, { name: v.name || file.name, folderId: v.folderId || null, clientId: v.clientId || null, quoteId: v.quoteId || null });
          toast('File saved.');
        } catch (e) { toastError(e); return false; }
        return true;
      },
    });
  }

  async function trash(file) {
    try {
      await trashFile(file);
      toast(`${file.name} moved to Trash.`, { undo: () => restoreFile(file) });
    } catch (e) { toastError(e); }
  }

  async function destroy(file) {
    if (!(await confirm({ title: `Delete ${file.name} forever?`, body: 'This cannot be undone.', confirmLabel: 'Delete forever', danger: true }))) return;
    try { await destroyFile(file); toast('File deleted.'); } catch (e) { toastError(e); }
  }

  // ---------- events ----------

  const headerEl = document.querySelector('[data-actions]');
  const onHeaderClick = (e) => { if (e.target.closest('[data-act="new-folder"]')) folderDrawer(); };
  const onPick = (e) => { if (e.target.matches('[data-picker]')) { upload(e.target.files); e.target.value = ''; } };
  headerEl.addEventListener('click', onHeaderClick);
  headerEl.addEventListener('change', onPick);
  view.onCleanup(() => { headerEl.removeEventListener('click', onHeaderClick); headerEl.removeEventListener('change', onPick); });

  view.el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-action], [data-act]');
    if (act) {
      const a = act.dataset.action || act.dataset.act;
      if (a === 'upload') { headerEl.querySelector('[data-picker]').click(); return; }
      if (a === 'empty-trash') {
        const all = [...state.files.values()].filter((x) => x.deletedAt);
        if (!(await confirm({ title: 'Empty trash?', body: `${all.length} ${all.length === 1 ? 'file is' : 'files are'} deleted forever.`, confirmLabel: 'Empty trash', danger: true }))) return;
        try { for (const x of all) await destroyFile(x); toast('Trash emptied.'); } catch (err) { toastError(err); }
        return;
      }
      if (a === 'folder-menu') {
        e.stopPropagation();
        const fo = state.folders.get(act.dataset.id);
        menu(act, [
          { label: 'Rename or move', icon: 'edit', onSelect: () => folderDrawer(fo) },
          { label: 'Delete', icon: 'trash', danger: true, onSelect: () => deleteFolder(fo) },
        ]);
        return;
      }
      if (a === 'file-menu') {
        e.stopPropagation();
        const file = state.files.get(act.dataset.id);
        menu(act, file.deletedAt
          ? [{ label: 'Restore', icon: 'restore', onSelect: () => restoreFile(file).then(() => toast('File restored.')).catch(toastError) },
             { label: 'Delete forever', icon: 'trash', danger: true, onSelect: () => destroy(file) }]
          : [{ label: 'Open', icon: 'eye', onSelect: () => fileDetails(file) },
             { label: 'Download', icon: 'download', onSelect: () => downloadFile(file).catch(toastError) },
             'sep',
             { label: 'Move to Trash', icon: 'trash', danger: true, onSelect: () => trash(file) }]);
        return;
      }
    }
    const folderRow = e.target.closest('[data-open-folder]');
    if (folderRow) { navigate(`/admin/files/?folder=${folderRow.dataset.openFolder}`); return; }
    const row = e.target.closest('tr[data-file]');
    if (row && ui.folder !== TRASH) fileDetails(state.files.get(row.dataset.file));
  });

  view.el.querySelector('[data-search]').addEventListener('input', (e) => { ui.search = e.target.value.trim(); drawList(); });

  const drop = $('[data-drop]');
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); drop.classList.add('over'); } }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); });
  drop.addEventListener('click', () => headerEl.querySelector('[data-picker]').click());

  // Drag a file row onto a folder in the tree to move it.
  view.el.addEventListener('dragstart', (e) => {
    const row = e.target.closest('tr[data-file]');
    if (row) e.dataTransfer.setData('text/x-file-id', row.dataset.file);
  });
  const tree = $('[data-tree]');
  tree.addEventListener('dragover', (e) => {
    const a = e.target.closest('[data-folder]');
    if (!a || a.dataset.folder === TRASH || !e.dataTransfer.types.includes('text/x-file-id')) return;
    e.preventDefault();
    tree.querySelectorAll('.drop').forEach((n) => n.classList.remove('drop'));
    a.classList.add('drop');
  });
  tree.addEventListener('dragleave', (e) => e.target.closest('[data-folder]')?.classList.remove('drop'));
  tree.addEventListener('drop', async (e) => {
    const a = e.target.closest('[data-folder]');
    tree.querySelectorAll('.drop').forEach((n) => n.classList.remove('drop'));
    const id = e.dataTransfer.getData('text/x-file-id');
    if (!a || !id) return;
    e.preventDefault();
    const file = state.files.get(id);
    const to = a.dataset.folder || null;
    if (file.folderId === to) return;
    const from = file.folderId || null;
    try {
      await update('files', id, { folderId: to });
      toast(`Moved to ${to ? state.folders.get(to).name : 'All files'}.`, { undo: () => update('files', id, { folderId: from }) });
    } catch (err) { toastError(err); }
  });

  drawTree();
  drawList();
  view.watch(['files', 'folders'], () => { drawTree(); drawList(); });

  if (q.file && state.files.get(q.file)) fileDetails(state.files.get(q.file));
}
