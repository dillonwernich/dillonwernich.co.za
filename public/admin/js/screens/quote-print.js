import { html } from '../lib/html.js';
import { state, logQuote } from '../data/store.js';
import { renderQuoteDoc } from '../doc/render.js';
import { icon } from '../ui/icons.js';
import { toast, toastError } from '../ui/toast.js';
import { uploadFile, ensureFolder } from '../data/files.js';

async function snapshotHtml(quote, business) {
  const css = await (await fetch('/admin/css/doc.css')).text();
  const origin = location.origin.includes('localhost') || location.origin.includes('127.0.0.1') ? 'https://dillonwernich.co.za' : location.origin;
  const fonts = [
    ['IBM Plex Sans', 400, 'ibm-plex-sans-latin-400-normal'],
    ['IBM Plex Sans', 500, 'ibm-plex-sans-latin-500-normal'],
    ['IBM Plex Sans', 600, 'ibm-plex-sans-latin-600-normal'],
    ['IBM Plex Sans', 700, 'ibm-plex-sans-latin-700-normal'],
    ['IBM Plex Mono', 500, 'ibm-plex-mono-latin-500-normal'],
  ].map(([fam, w, file]) => `@font-face{font-family:"${fam}";font-weight:${w};font-style:normal;font-display:swap;src:url("${origin}/fonts/${file}.woff2") format("woff2")}`).join('\n');
  return `<!DOCTYPE html>
<html lang="en-ZA"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${String(html`${quote.number || 'Quote'} · ${quote.title || ''}`)}</title>
<style>${fonts}
html{background:#F1F3FB}body{margin:0;padding:32px 16px;display:flex;justify-content:center}
@media print{html{background:#fff}body{padding:0;display:block}}
${css}</style></head>
<body>${String(renderQuoteDoc(quote, business))}</body></html>`;
}

export default function quotePrint(view) {
  const id = view.params.id;
  const quote = state.quotes.get(id);
  view.el.className = 'content flush';

  if (!quote) {
    view.header({ title: 'Quote not found', crumb: { href: '/admin/quotes/', label: 'Quotes' } });
    view.el.innerHTML = String(html`<div class="content"><div class="panel"><div class="empty"><p>This quote does not exist or was deleted.</p><a class="btn" href="/admin/quotes/">All quotes</a></div></div></div>`);
    return;
  }

  view.header({
    title: 'Print',
    crumb: { href: `/admin/quotes/${id}/`, label: quote.number || quote.title || 'Quote' },
  });

  const business = state.settings.business || {};
  view.el.innerHTML = String(html`
    <div class="doc-toolbar">
      <a class="btn btn-ghost" href="/admin/quotes/${id}/">${icon('back')}Back to quote</a>
      <span class="spacer"></span>
      <span class="faint hide-sm">Choose “Save as PDF” in the print dialog.</span>
      <button type="button" class="btn" data-act="save">${icon('files')}Save to files</button>
      <button type="button" class="btn" data-act="html">${icon('download')}HTML</button>
      <button type="button" class="btn btn-primary" data-act="print">${icon('printer')}Print or PDF</button>
    </div>
    <div class="doc-stage">${renderQuoteDoc(quote, business)}</div>`);

  const fileName = () => `${quote.number || 'Draft quote'} ${quote.clientSnapshot?.company || ''}`.trim().replace(/\s+/g, ' ');

  view.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'print') {
      const prev = document.title;
      document.title = fileName();
      window.print();
      document.title = prev;
      return;
    }
    if (b.dataset.act === 'html') {
      const blob = new Blob([await snapshotHtml(quote, business)], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${fileName()}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return;
    }
    if (b.dataset.act === 'save') {
      b.disabled = true;
      try {
        const folderId = await ensureFolder('Quotes');
        const blob = new Blob([await snapshotHtml(quote, business)], { type: 'text/html' });
        const { done } = uploadFile(blob, { name: `${fileName()}.html`, folderId, clientId: quote.clientId || null, quoteId: id, contentType: 'text/html' });
        await done;
        await logQuote(id, 'saved', `${fileName()}.html`);
        toast('Saved to Files as an HTML snapshot.');
      } catch (err) {
        toastError(err, 'Could not save to files.');
      } finally {
        b.disabled = false;
      }
    }
  });
}
