import { buildCombinedHtml, visiblePages } from '../lib/combined-export.js';
import { downloadNfpBlob, parseNfpFile } from '../lib/nfp-format.js';

const params = new URLSearchParams(location.search);
let projectId = params.get('id');
let project = null;

const els = {
  title: document.getElementById('project-title'),
  meta: document.getElementById('meta'),
  list: document.getElementById('page-list'),
  importFile: document.getElementById('import-file'),
};

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeName(title) {
  return (title || 'multipage').replace(/[^\w\-]+/g, '_').slice(0, 60);
}

async function loadProject() {
  const resp = await chrome.runtime.sendMessage({ type: 'MULTIPAGE_LOAD', id: projectId });
  if (!resp?.ok || !resp.project) {
    els.meta.textContent = 'Project not found.';
    return;
  }
  project = resp.project;
  project.pages.sort((a, b) => a.order - b.order);
  render();
}

function render() {
  els.title.textContent = project.title || 'Multipage project';
  const visible = visiblePages(project).length;
  els.meta.textContent = `${project.pages.length} scan(s) · ${visible} included in export`;
  els.list.innerHTML = '';
  for (const page of project.pages) {
    const li = document.createElement('li');
    li.className = 'page-item' + (page.hidden ? ' hidden-page' : '');
    li.draggable = true;
    li.dataset.id = page.id;
    li.innerHTML = `
      <label><input type="checkbox" data-include ${page.hidden ? '' : 'checked'} /> Include</label>
      <img class="thumb" alt="" src="${page.pngDataUrl || ''}" />
      <div class="page-fields">
        <input type="text" data-title value="${escapeAttr(page.title || '')}" />
        <div class="page-url">${escapeHtml(page.url || '')}</div>
      </div>
      <div class="page-controls">
        <button type="button" data-up>↑</button>
        <button type="button" data-down>↓</button>
        <button type="button" data-del>Delete</button>
      </div>`;
    wireItem(li, page);
    els.list.appendChild(li);
  }
  wireDragReorder();
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function wireItem(li, page) {
  li.querySelector('[data-include]').addEventListener('change', (e) => {
    page.hidden = !e.target.checked;
    li.classList.toggle('hidden-page', page.hidden);
    save();
  });
  li.querySelector('[data-title]').addEventListener('change', (e) => {
    page.title = e.target.value;
    save();
  });
  li.querySelector('[data-up]').addEventListener('click', () => movePage(page.id, -1));
  li.querySelector('[data-down]').addEventListener('click', () => movePage(page.id, 1));
  li.querySelector('[data-del]').addEventListener('click', () => {
    project.pages = project.pages.filter((p) => p.id !== page.id);
    save().then(render);
  });
}

function movePage(id, dir) {
  const idx = project.pages.findIndex((p) => p.id === id);
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= project.pages.length) return;
  const tmp = project.pages[idx];
  project.pages[idx] = project.pages[j];
  project.pages[j] = tmp;
  project.pages.forEach((p, i) => {
    p.order = i;
  });
  save().then(render);
}

function wireDragReorder() {
  let dragId = null;
  els.list.querySelectorAll('.page-item').forEach((li) => {
    li.addEventListener('dragstart', () => {
      dragId = li.dataset.id;
      li.classList.add('dragging');
    });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    li.addEventListener('dragover', (e) => e.preventDefault());
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetId = li.dataset.id;
      if (!dragId || dragId === targetId) return;
      const from = project.pages.findIndex((p) => p.id === dragId);
      const to = project.pages.findIndex((p) => p.id === targetId);
      const [item] = project.pages.splice(from, 1);
      project.pages.splice(to, 0, item);
      project.pages.forEach((p, i) => {
        p.order = i;
      });
      save().then(render);
    });
  });
}

async function save() {
  const resp = await chrome.runtime.sendMessage({ type: 'MULTIPAGE_SAVE', project });
  if (resp?.ok) project = resp.project;
}

document.getElementById('btn-export-nfp').addEventListener('click', () => {
  downloadBlob(downloadNfpBlob(project), `${safeName(project.title)}.nfp`);
});

document.getElementById('btn-import').addEventListener('click', () => els.importFile.click());
els.importFile.addEventListener('change', async () => {
  const file = els.importFile.files?.[0];
  if (!file) return;
  const text = await file.text();
  const imported = parseNfpFile(text);
  imported.id = crypto.randomUUID();
  imported.status = 'editing';
  imported.pages.forEach((p, i) => {
    p.order = i;
  });
  const resp = await chrome.runtime.sendMessage({ type: 'MULTIPAGE_SAVE', project: imported });
  if (resp?.ok) {
    projectId = resp.project.id;
    project = resp.project;
    history.replaceState(null, '', `?id=${encodeURIComponent(projectId)}`);
    render();
  }
  els.importFile.value = '';
});

document.getElementById('btn-dl-html').addEventListener('click', () => {
  const html = buildCombinedHtml(project);
  downloadBlob(new Blob([html], { type: 'text/html' }), `${safeName(project.title)}.html`);
});

document.getElementById('btn-dl-png').addEventListener('click', async () => {
  const resp = await chrome.runtime.sendMessage({ type: 'MULTIPAGE_EXPORT_PNG', projectId: project.id });
  if (!resp?.ok) {
    alert(resp?.error || 'Export failed');
    return;
  }
  if (resp.zip) {
    downloadBlob(await (await fetch(resp.zip)).blob(), `${safeName(project.title)}-pages.zip`);
  } else if (resp.pngDataUrl) {
    downloadBlob(await (await fetch(resp.pngDataUrl)).blob(), `${safeName(project.title)}.png`);
  }
});

document.getElementById('btn-dl-pdf').addEventListener('click', async () => {
  const resp = await chrome.runtime.sendMessage({ type: 'MULTIPAGE_EXPORT_PDF', projectId: project.id });
  if (!resp?.ok) {
    alert(resp?.error || 'Export failed');
    return;
  }
  downloadBlob(await (await fetch(resp.pdfDataUrl)).blob(), `${safeName(project.title)}.pdf`);
});

document.getElementById('btn-dl-separate').addEventListener('click', async () => {
  const format = document.getElementById('separate-format').value;
  const resp = await chrome.runtime.sendMessage({
    type: 'MULTIPAGE_EXPORT_SEPARATE',
    projectId: project.id,
    format,
  });
  if (!resp?.ok) {
    alert(resp?.error || 'Export failed');
    return;
  }
  if (!resp.zip) {
    alert('Export failed');
    return;
  }
  downloadBlob(await (await fetch(resp.zip)).blob(), `${safeName(project.title)}-pages.zip`);
});

if (projectId) loadProject();
else els.meta.textContent = 'Open from Finish in multipage mode or import a .nfp file.';
