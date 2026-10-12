import { captureTabImage } from './capture-image.js';
import { captureTabReconstruct } from './capture-reconstruct.js';
import { captureFullScan } from './capture-fullscan.js';
import { listCaptures } from '../lib/idb.js';
import { getSettings } from '../lib/settings.js';
import { createProgressReporter, progressHide, progressUpdate } from './progress.js';
import { registerContextMenus, menuIdToKind, MENU } from './context-menus.js';

const BUSY_KEY = 'captureBusy';

const PROGRESS_TITLES = {
  image: 'Capturing full page image…',
  reconstruct: 'Reconstructing searchable HTML…',
  fullscan: 'Running full scan…',
};

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

function openHistory() {
  chrome.tabs.create({ url: chrome.runtime.getURL('viewer/viewer.html') });
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

function openPopupWindow() {
  chrome.windows.create({
    url: chrome.runtime.getURL('popup/popup.html'),
    type: 'popup',
    width: 360,
    height: 520,
  });
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
  const tabId = options.tabId ?? (await activeTabId());
  const settings = await getSettings();
  const progressTitle = PROGRESS_TITLES[kind] || 'Capturing…';
  const report = createProgressReporter(tabId, progressTitle);
  const captureOptions = {
    ...options,
    overlapPx: options.overlapPx ?? settings.overlapPx,
    pageLimit: options.pageLimit ?? settings.fullScanPageLimit,
    followPagination: options.followPagination ?? settings.followPagination,
    onProgress: async (percent, detail) => {
      await report(percent, detail);
    },
  };

  try {
    await progressUpdate(tabId, { title: progressTitle, percent: 2, detail: 'Starting…' });
    let record;
    switch (kind) {
      case 'image':
        record = await captureTabImage(tabId, captureOptions);
        break;
      case 'reconstruct':
        record = await captureTabReconstruct(tabId, captureOptions);
        break;
      case 'fullscan':
        record = await captureFullScan(tabId, captureOptions);
        break;
      default:
        throw new Error(`Unknown capture kind: ${kind}`);
    }
    if (settings.openViewerAfterCapture) {
      openViewer(record.id);
    }
    return { ok: true, id: record.id };
  } catch (err) {
    await progressUpdate(tabId, {
      title: 'Capture failed',
      percent: 100,
      detail: String(err.message || err),
      error: true,
    });
    await new Promise((r) => setTimeout(r, 2200));
    throw err;
  } finally {
    await progressHide(tabId);
    await setBusy(false);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenus();
});

registerContextMenus();

chrome.action.onClicked.addListener(async () => {
  try {
    const settings = await getSettings();
    const kind = settings.toolbarCaptureMode || 'image';
    await runCapture(kind);
  } catch (err) {
    console.error(err);
  }
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  const kind = menuIdToKind(info.menuItemId);
  if (kind) {
    runCapture(kind).catch((err) => console.error(err));
    return;
  }
  if (info.menuItemId === MENU.history) openHistory();
  if (info.menuItemId === MENU.options) openOptions();
  if (info.menuItemId === MENU.popup) openPopupWindow();
});

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
  if (message.type === 'FULLPAGE_GET_SETTINGS') {
    getSettings().then((s) => sendResponse({ ok: true, settings: s }));
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
