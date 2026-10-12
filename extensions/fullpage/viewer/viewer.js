import { getCapture, listCaptures, deleteCapture } from '../lib/idb.js';

const params = new URLSearchParams(location.search);
let currentId = params.get('id');
let currentRecord = null;
let searchIndex = '';

const els = {
  meta: document.getElementById('meta'),
  root: document.getElementById('preview-root'),
  history: document.getElementById('history-list'),
  search: document.getElementById('search-input'),
  searchStatus: document.getElementById('search-status'),
  btnPng: document.getElementById('btn-png'),
  btnPdf: document.getElementById('btn-pdf'),
  btnHtml: document.getElementById('btn-html'),
  btnDelete: document.getElementById('btn-delete'),
};

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function downloadBlob(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFilename(title) {
  return (title || 'capture').replace(/[^\w\-]+/g, '_').slice(0, 80);
}

function buildSearchIndex(record) {
  if (record.html) {
    const doc = new DOMParser().parseFromString(record.html, 'text/html');
    return doc.body?.innerText || '';
  }
  return record.title || '';
}

function renderPreview(record) {
  els.root.innerHTML = '';
  if (record.pngDataUrl) {
    const img = document.createElement('img');
    img.src = record.pngDataUrl;
    img.alt = record.title || 'Screenshot';
    els.root.appendChild(img);
  } else if (record.html) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.srcdoc = record.html;
    els.root.appendChild(iframe);
  } else {
    els.root.textContent = 'No preview available.';
  }

  const when = new Date(record.createdAt).toLocaleString();
  els.meta.textContent = `${record.type} · ${record.pageCount || 1} page(s) · ${when} · ${record.url || ''}`;

  els.btnPng.hidden = !record.pngDataUrl;
  els.btnPdf.hidden = !record.pdfDataUrl;
  els.btnHtml.hidden = !record.html;

  els.btnPng.onclick = () => downloadDataUrl(record.pngDataUrl, `${safeFilename(record.title)}.png`);
  els.btnPdf.onclick = () => downloadDataUrl(record.pdfDataUrl, `${safeFilename(record.title)}.pdf`);
  els.btnHtml.onclick = () => downloadBlob(record.html, `${safeFilename(record.title)}.html`, 'text/html');
}

function highlightSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    els.searchStatus.textContent = '';
    return;
  }
  const text = searchIndex.toLowerCase();
  let count = 0;
  let idx = text.indexOf(q);
  while (idx !== -1) {
    count++;
    idx = text.indexOf(q, idx + q.length);
  }
  els.searchStatus.textContent = count ? `${count} match(es) in snapshot text` : 'No matches in snapshot text';
  const iframe = els.root.querySelector('iframe');
  if (iframe?.contentWindow && iframe.contentDocument?.body) {
    try {
      iframe.contentWindow.find(query, false, false, true, false, true, false);
    } catch {
      /* sandbox may block */
    }
  }
}

async function loadRecord(id) {
  const record = await getCapture(id);
  if (!record) {
    els.meta.textContent = 'Capture not found.';
    els.root.textContent = '';
    return;
  }
  currentId = id;
  currentRecord = record;
  searchIndex = buildSearchIndex(record);
  renderPreview(record);
  highlightSearch(els.search.value);
  history.replaceState(null, '', `?id=${encodeURIComponent(id)}`);
  await refreshHistory();
}

async function refreshHistory() {
  const items = await listCaptures(40);
  els.history.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.title || item.url || item.id;
    btn.title = item.url || '';
    if (item.id === currentId) btn.classList.add('active');
    btn.addEventListener('click', () => loadRecord(item.id));
    li.appendChild(btn);
    els.history.appendChild(li);
  }
}

els.search.addEventListener('input', () => highlightSearch(els.search.value));

els.btnDelete.addEventListener('click', async () => {
  if (!currentId) return;
  if (!confirm('Delete this capture from local history?')) return;
  await deleteCapture(currentId);
  const items = await listCaptures(1);
  if (items.length) await loadRecord(items[0].id);
  else {
    currentId = null;
    currentRecord = null;
    els.meta.textContent = 'No captures yet.';
    els.root.textContent = '';
    await refreshHistory();
  }
});

if (currentId) loadRecord(currentId);
else refreshHistory().then(async () => {
  const items = await listCaptures(1);
  if (items[0]) loadRecord(items[0].id);
});
