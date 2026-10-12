import { captureTabImage } from './capture-image.js';
import { captureTabReconstruct } from './capture-reconstruct.js';
import { captureFullScan } from './capture-fullscan.js';
import { listCaptures } from '../lib/idb.js';

const BUSY_KEY = 'captureBusy';

async function setBusy(busy) {
  await chrome.storage.session.set({ [BUSY_KEY]: busy });
}

async function isBusy() {
  const data = await chrome.storage.session.get(BUSY_KEY);
  return Boolean(data[BUSY_KEY]);
}

function openViewer(captureId) {
  const url = chrome.runtime.getURL(`viewer/viewer.html?id=${encodeURIComponent(captureId)}`);
  chrome.tabs.create({ url });
}

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
    throw new Error('Cannot capture browser internal pages');
  }
  return tab.id;
}

async function runCapture(kind, options = {}) {
  if (await isBusy()) throw new Error('A capture is already running');
  await setBusy(true);
  try {
    const tabId = options.tabId ?? (await activeTabId());
    let record;
    switch (kind) {
      case 'image':
        record = await captureTabImage(tabId, options);
        break;
      case 'reconstruct':
        record = await captureTabReconstruct(tabId, options);
        break;
      case 'fullscan':
        record = await captureFullScan(tabId, options);
        break;
      default:
        throw new Error(`Unknown capture kind: ${kind}`);
    }
    openViewer(record.id);
    return { ok: true, id: record.id };
  } finally {
    await setBusy(false);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'FULLPAGE_CAPTURE') {
    runCapture(message.kind, message.options || {})
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
  if (message.type === 'FULLPAGE_LIST') {
    listCaptures(message.limit ?? 30)
      .then((items) => sendResponse({ ok: true, items }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (message.type === 'FULLPAGE_STATUS') {
    isBusy().then((busy) => sendResponse({ ok: true, busy }));
    return true;
  }
  return false;
});

chrome.commands.onCommand.addListener((command) => {
  const map = {
    'capture-image': 'image',
    'capture-reconstruct': 'reconstruct',
    'capture-fullscan': 'fullscan',
  };
  const kind = map[command];
  if (kind) runCapture(kind).catch((err) => console.error(err));
});
