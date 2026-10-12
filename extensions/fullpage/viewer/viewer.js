import { getCapture, listCaptures, deleteCapture, putCapture } from '../lib/idb.js';
import { createAnnotator } from './annotate.js';

const params = new URLSearchParams(location.search);
let currentId = params.get('id');
let currentRecord = null;
let searchIndex = '';
let annotator = null;
let editMode = false;

const els = {
  meta: document.getElementById('meta'),
  root: document.getElementById('preview-root'),
  history: document.getElementById('history-list'),
  search: document.getElementById('search-input'),
  searchStatus: document.getElementById('search-status'),
  btnEdit: document.getElementById('btn-edit'),
  btnPdf: document.getElementById('btn-pdf'),
  btnDownload: document.getElementById('btn-download'),
  btnHtml: document.getElementById('btn-html'),
  btnDelete: document.getElementById('btn-delete'),
  btnHistory: document.getElementById('btn-history'),
  btnSettings: document.getElementById('btn-settings'),
  editBar: document.getElementById('edit-bar'),
  extrasBar: document.getElementById('extras-bar'),
  drawer: document.getElementById('history-drawer'),
  backdrop: document.getElementById('drawer-backdrop'),
  btnCloseHistory: document.getElementById('btn-close-history'),
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

function teardownAnnotator() {
  if (annotator) {
    annotator.destroy();
    annotator = null;
  }
  editMode = false;
  els.editBar.hidden = true;
}

function renderPreview(record) {
  teardownAnnotator();
  els.root.innerHTML = '';

  if (record.pngDataUrl) {
    const img = document.createElement('img');
    img.src = record.pngDataUrl;
    img.alt = record.title || 'Screenshot';
    els.root.appendChild(img);
    els.btnEdit.disabled = false;
  } else if (record.html) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.srcdoc = record.html;
    els.root.appendChild(iframe);
    els.btnEdit.disabled = true;
    els.extrasBar.hidden = false;
  } else {
    els.root.textContent = 'No preview available.';
    els.btnEdit.disabled = true;
  }

  const when = new Date(record.createdAt).toLocaleString();
  els.meta.textContent = `${record.type} · ${record.pageCount || 1} page(s) · ${when}`;

  els.btnPdf.hidden = !record.pdfDataUrl;
  els.btnDownload.hidden = !record.pngDataUrl && !record.html;
  els.btnHtml.hidden = !record.html;
  els.extrasBar.hidden = !record.html;

  els.btnPdf.onclick = () => downloadDataUrl(record.pdfDataUrl, `${safeFilename(record.title)}.pdf`);
  els.btnDownload.onclick = () => {
    if (record.pngDataUrl) downloadDataUrl(record.pngDataUrl, `${safeFilename(record.title)}.png`);
    else if (record.html) downloadBlob(record.html, `${safeFilename(record.title)}.html`, 'text/html');
  };
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
  els.searchStatus.textContent = count
    ? `${count} match(es) in snapshot text`
    : 'No matches in snapshot text';
  const iframe = els.root.querySelector('iframe');
  if (iframe?.contentWindow) {
    try {
      iframe.contentWindow.find(query, false, false, true, false, true, false);
    } catch {
      /* sandbox */
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
    btn.addEventListener('click', () => {
      loadRecord(item.id);
      closeHistory();
    });
    li.appendChild(btn);
    els.history.appendChild(li);
  }
}

function openHistory() {
  els.drawer.hidden = false;
  els.backdrop.hidden = false;
  refreshHistory();
}

function closeHistory() {
  els.drawer.hidden = true;
  els.backdrop.hidden = true;
}

els.search.addEventListener('input', () => highlightSearch(els.search.value));
els.btnHistory.addEventListener('click', openHistory);
els.btnCloseHistory.addEventListener('click', closeHistory);
els.backdrop.addEventListener('click', closeHistory);
els.btnSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());

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

els.btnEdit.addEventListener('click', () => {
  if (!currentRecord?.pngDataUrl || editMode) return;
  const img = els.root.querySelector('img');
  if (!img) return;
  editMode = true;
  els.editBar.hidden = false;
  const imgClone = img.cloneNode(true);
  els.root.innerHTML = '';
  annotator = createAnnotator(els.root, imgClone);
});

els.editBar.addEventListener('click', (ev) => {
  const tool = ev.target.closest('[data-tool]')?.dataset.tool;
  if (tool && annotator) {
    annotator.setTool(tool);
    els.editBar.querySelectorAll('[data-tool]').forEach((b) => b.classList.remove('active'));
    ev.target.closest('[data-tool]').classList.add('active');
  }
});

document.getElementById('btn-undo').addEventListener('click', () => annotator?.undo());

document.getElementById('btn-cancel-edit').addEventListener('click', () => {
  if (currentRecord) renderPreview(currentRecord);
});

document.getElementById('btn-save-edit').addEventListener('click', async () => {
  if (!annotator || !currentRecord) return;
  const pngDataUrl = await annotator.exportPng();
  currentRecord.pngDataUrl = pngDataUrl;
  await putCapture(currentRecord);
  renderPreview(currentRecord);
});

if (currentId) loadRecord(currentId);
else {
  refreshHistory().then(async () => {
    const items = await listCaptures(1);
    if (items[0]) loadRecord(items[0].id);
  });
}
