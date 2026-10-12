import { getCapture, listCaptures, deleteCapture, putCapture } from '../lib/idb.js';
import { createAnnotator } from './annotate.js';
import { mountTextLayer } from './text-layer.js';

const params = new URLSearchParams(location.search);
let currentId = params.get('id');
let currentRecord = null;
let searchIndex = '';
let annotator = null;
let textLayerController = null;
let editMode = false;
/** @type {'html' | 'image'} */
let previewMode = 'html';

const els = {
  meta: document.getElementById('meta'),
  root: document.getElementById('preview-root'),
  history: document.getElementById('history-list'),
  search: document.getElementById('search-input'),
  searchStatus: document.getElementById('search-status'),
  btnEdit: document.getElementById('btn-edit'),
  btnPdf: document.getElementById('btn-pdf'),
  btnDownloadPng: document.getElementById('btn-download-png'),
  btnHtml: document.getElementById('btn-html'),
  btnDelete: document.getElementById('btn-delete'),
  btnHistory: document.getElementById('btn-history'),
  btnSettings: document.getElementById('btn-settings'),
  btnSearch: document.getElementById('btn-search'),
  btnReconstruct: document.getElementById('btn-reconstruct'),
  btnViewScreenshot: document.getElementById('btn-view-screenshot'),
  btnViewPage: document.getElementById('btn-view-page'),
  editBar: document.getElementById('edit-bar'),
  extrasBar: document.getElementById('extras-bar'),
  drawer: document.getElementById('history-drawer'),
  backdrop: document.getElementById('drawer-backdrop'),
  btnCloseHistory: document.getElementById('btn-close-history'),
  btnUndo: document.getElementById('btn-undo'),
  btnSaveEdit: document.getElementById('btn-save-edit'),
  btnCancelEdit: document.getElementById('btn-cancel-edit'),
};

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadBlob(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(title) {
  return (title || 'capture').replace(/[^\w\-]+/g, '_').slice(0, 80);
}

function buildSearchIndex(record) {
  if (record.pageText) return record.pageText;
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
  if (textLayerController) {
    textLayerController.destroy();
    textLayerController = null;
  }
  editMode = false;
  els.editBar.hidden = true;
}

function wireDownloads(record) {
  const name = safeFilename(record.title);
  els.btnDownloadPng.hidden = !record.pngDataUrl;
  els.btnPdf.hidden = !record.pdfDataUrl;
  els.btnHtml.hidden = !record.html;

  els.btnDownloadPng.onclick = () => downloadDataUrl(record.pngDataUrl, `${name}.png`);
  els.btnPdf.onclick = () => downloadDataUrl(record.pdfDataUrl, `${name}.pdf`);
  els.btnHtml.onclick = () => downloadBlob(record.html, `${name}.html`, 'text/html');
}

function defaultPreviewMode(record) {
  if (record.html) return 'html';
  if (record.pngDataUrl) return 'image';
  return 'html';
}

function updateViewToggleButtons(record) {
  const hasHtml = Boolean(record.html);
  const hasImage = Boolean(record.pngDataUrl);
  const dual = hasHtml && hasImage;
  els.btnViewScreenshot.hidden = !dual || previewMode === 'image';
  els.btnViewPage.hidden = !dual || previewMode === 'html';
}

function mountHtmlPreview(record) {
  const iframe = document.createElement('iframe');
  iframe.className = 'html-snapshot';
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.srcdoc = record.html;
  els.root.appendChild(iframe);
  els.btnEdit.disabled = true;
}

function mountImagePreview(record) {
  const wrap = document.createElement('div');
  wrap.className = 'capture-stack';
  const img = document.createElement('img');
  img.src = record.pngDataUrl;
  img.alt = record.title || 'Screenshot';
  wrap.appendChild(img);
  els.root.appendChild(wrap);
  if (record.textLayer?.items?.length) {
    textLayerController = mountTextLayer(wrap, img, record.textLayer, record.metrics);
  }
  els.btnEdit.disabled = false;
}

function renderPreview(record) {
  teardownAnnotator();
  els.root.innerHTML = '';
  currentRecord = record;

  const hasSearchText = Boolean(record.pageText || record.html);
  const hasHtml = Boolean(record.html);
  const hasImage = Boolean(record.pngDataUrl);
  if (previewMode === 'image' && !hasImage) previewMode = 'html';
  if (previewMode === 'html' && !hasHtml && hasImage) previewMode = 'image';

  if (previewMode === 'html' && hasHtml) {
    mountHtmlPreview(record);
    els.extrasBar.hidden = !hasSearchText;
  } else if (hasImage) {
    previewMode = 'image';
    mountImagePreview(record);
    els.extrasBar.hidden = !hasSearchText;
  } else if (hasHtml) {
    previewMode = 'html';
    mountHtmlPreview(record);
    els.extrasBar.hidden = !hasSearchText;
  } else {
    els.root.textContent = 'No preview available.';
    els.btnEdit.disabled = true;
    els.extrasBar.hidden = true;
  }

  updateViewToggleButtons(record);

  const when = new Date(record.createdAt).toLocaleString();
  const viewNote = previewMode === 'html' && record.html ? ' · page snapshot' : '';
  const searchNote = hasSearchText ? ' · searchable text' : '';
  els.meta.textContent = `${record.type} · ${record.pageCount || 1} page(s) · ${when}${viewNote}${searchNote}`;

  wireDownloads(record);
}

function highlightSearch(query) {
  const q = query.trim();
  if (!q) {
    els.searchStatus.textContent = '';
    textLayerController?.highlight('');
    return;
  }
  const text = searchIndex.toLowerCase();
  const ql = q.toLowerCase();
  let count = 0;
  let idx = text.indexOf(ql);
  while (idx !== -1) {
    count++;
    idx = text.indexOf(ql, idx + ql.length);
  }
  if (textLayerController) {
    const overlayHits = textLayerController.highlight(q);
    if (overlayHits > 0) count = Math.max(count, overlayHits);
  }
  const hint =
    previewMode === 'html' && els.root.querySelector('iframe')
      ? ' — use Ctrl+F in the page snapshot'
      : ' — use Ctrl+F on the screenshot overlay';
  els.searchStatus.textContent = count ? `${count} match(es)${hint}` : 'No matches in text layer';
  const iframe = els.root.querySelector('iframe');
  if (iframe?.contentWindow) {
    try {
      iframe.contentWindow.find(q, false, false, true, false, true, false);
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
  searchIndex = buildSearchIndex(record);
  previewMode = defaultPreviewMode(record);
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

function setAnnotateTool(tool) {
  if (!annotator) return;
  annotator.setTool(tool);
  els.editBar.querySelectorAll('[data-tool]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === tool);
  });
}

els.search?.addEventListener('input', () => highlightSearch(els.search.value));
els.btnHistory.addEventListener('click', openHistory);
els.btnCloseHistory.addEventListener('click', closeHistory);
els.backdrop.addEventListener('click', closeHistory);
els.btnSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());

els.btnSearch.addEventListener('click', () => {
  els.extrasBar.hidden = false;
  els.search.focus();
  els.search.select();
});

els.btnViewScreenshot?.addEventListener('click', () => {
  if (!currentRecord?.pngDataUrl) return;
  previewMode = 'image';
  renderPreview(currentRecord);
  highlightSearch(els.search.value);
});

els.btnViewPage?.addEventListener('click', () => {
  if (!currentRecord?.html) return;
  previewMode = 'html';
  renderPreview(currentRecord);
  highlightSearch(els.search.value);
});

els.btnReconstruct.addEventListener('click', async () => {
  const resp = await chrome.runtime.sendMessage({ type: 'FULLPAGE_CAPTURE', kind: 'reconstruct' });
  if (!resp?.ok) alert(resp?.error || 'Reconstruct failed');
});

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
  const img = els.root.querySelector('.capture-stack img, .preview-root img, img');
  if (!img) return;
  editMode = true;
  els.editBar.hidden = false;
  if (textLayerController) {
    textLayerController.destroy();
    textLayerController = null;
  }
  const stack = els.root.querySelector('.capture-stack') || els.root;
  const imgClone = img.cloneNode(true);
  stack.innerHTML = '';
  annotator = createAnnotator(stack, imgClone);
});

els.editBar.querySelectorAll('[data-tool]').forEach((btn) => {
  btn.addEventListener('click', () => setAnnotateTool(btn.dataset.tool));
});

els.btnUndo.addEventListener('click', () => annotator?.undo());
els.btnCancelEdit.addEventListener('click', () => {
  if (currentRecord) renderPreview(currentRecord);
});
els.btnSaveEdit.addEventListener('click', async () => {
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

globalThis.__fullpageViewer = { downloadDataUrl, getCurrentRecord: () => currentRecord };
