const statusEl = document.getElementById('status');
const queueEl = document.getElementById('tab-queue');
let tabQueue = [];

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

function renderQueue() {
  queueEl.innerHTML = '';
  tabQueue.forEach((t, i) => {
    const li = document.createElement('li');
    li.textContent = `${i + 1}. ${t.title || t.url}`;
    queueEl.appendChild(li);
  });
}

async function sendCapture(kind, options = {}) {
  setStatus('Capturing…');
  const resp = await chrome.runtime.sendMessage({
    type: 'FULLPAGE_CAPTURE',
    kind,
    options,
  });
  if (!resp?.ok) {
    setStatus(resp?.error || 'Capture failed', true);
    return;
  }
  setStatus('Done — opening viewer');
}

document.getElementById('btn-image').addEventListener('click', () => sendCapture('image'));
document.getElementById('btn-reconstruct').addEventListener('click', () => sendCapture('reconstruct'));

document.getElementById('btn-fullscan').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabIds = tabQueue.map((t) => t.id);
  if (tab?.id && !tabIds.includes(tab.id)) tabIds.unshift(tab.id);
  await sendCapture('fullscan', {
    followPagination: document.getElementById('follow-pagination').checked,
    pageLimit: Number(document.getElementById('page-limit').value) || 25,
    tabIds: tabIds.length ? tabIds : undefined,
    mode: 'reconstruct',
  });
});

document.getElementById('btn-clear-queue').addEventListener('click', () => {
  tabQueue = [];
  renderQueue();
});

document.getElementById('queue-tab').addEventListener('change', async (ev) => {
  if (!ev.target.checked) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && !tabQueue.some((t) => t.id === tab.id)) {
    tabQueue.push({ id: tab.id, title: tab.title, url: tab.url });
    renderQueue();
  }
  ev.target.checked = false;
});

document.getElementById('btn-open-viewer').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('viewer/viewer.html') });
});

chrome.runtime.sendMessage({ type: 'FULLPAGE_STATUS' }).then((resp) => {
  if (resp?.busy) setStatus('Capture in progress…');
});

renderQueue();
