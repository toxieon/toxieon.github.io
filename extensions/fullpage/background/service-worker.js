import { captureTabImage } from './capture-image.js';
import { captureTabReconstruct } from './capture-reconstruct.js';
import { captureFullScan } from './capture-fullscan.js';
import { listCaptures } from '../lib/idb.js';
import { getSettings } from '../lib/settings.js';
import {
  createProgressReporter,
  progressHide,
  progressUpdate,
  openProgressWindow,
  showCaptureError,
} from './progress.js';
import { registerContextMenusSafe, menuIdToKind, MENU } from './context-menus.js';

const BUSY_KEY = 'captureBusy';

const PROGRESS_TITLES = {
  image: 'Screen capture in progress…',
  reconstruct: 'Reconstructing searchable HTML…',
  fullscan: 'Running full scan…',
};

// Recover from a crashed capture leaving the session stuck busy.
chrome.storage.session.set({ [BUSY_KEY]: false }).catch(() => {});

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

async function resolveCaptureTab(options = {}) {
  if (options.tabId) {
    const tab = await chrome.tabs.get(options.tabId);
    return tab;
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error('No active tab found. Focus the page you want to capture.');
  return tab;
}

function assertCapturableTab(tab) {
  const url = tab.url || '';
  if (!url || url === 'about:blank') {
    throw new Error('This tab has no loaded page yet.');
  }
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://')) {
    throw new Error('Cannot capture browser internal pages.');
  }
  if (/chrome\.google\.com\/webstore/.test(url)) {
    throw new Error('Chrome Web Store pages cannot be captured.');
  }
}

async function runCapture(kind, options = {}) {
  if (await isBusy()) {
    await showCaptureError('A capture is already running. Wait for it to finish or reload the extension.');
    throw new Error('A capture is already running');
  }

  const tab = await resolveCaptureTab(options);
  assertCapturableTab(tab);
  const tabId = tab.id;

  await setBusy(true);
  await openProgressWindow();
  const settings = await getSettings();
  const progressTitle = PROGRESS_TITLES[kind] || 'Screen capture in progress…';
  const report = createProgressReporter(tabId, progressTitle);
  const captureOptions = {
    ...options,
    tabId,
    overlapPx: options.overlapPx ?? settings.overlapPx,
    pageLimit: options.pageLimit ?? settings.fullScanPageLimit,
    followPagination: options.followPagination ?? settings.followPagination,
    onProgress: async (percent, detail) => {
      await report(percent, detail);
    },
  };

  let failed = false;
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
    failed = true;
    const message = err?.message || String(err);
    await showCaptureError(message, 'Capture failed');
    await progressUpdate(tabId, {
      title: 'Capture failed',
      percent: 100,
      detail: message,
      error: true,
    });
    throw err;
  } finally {
    await progressHide(tabId, { keepOpenOnError: failed });
    await setBusy(false);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenusSafe();
});

registerContextMenusSafe();

chrome.action.onClicked.addListener((tab) => {
  const tabId = tab?.id;
  getSettings()
    .then((settings) => {
      const kind = settings.toolbarCaptureMode || 'image';
      return runCapture(kind, tabId ? { tabId } : {});
    })
    .catch((err) => console.error('Full Page Capture:', err));
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const kind = menuIdToKind(info.menuItemId);
  if (kind) {
    runCapture(kind, tab?.id ? { tabId: tab.id } : {}).catch((err) =>
      console.error('Full Page Capture:', err)
    );
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
  if (kind) {
    runCapture(kind).catch((err) => console.error('Full Page Capture:', err));
  }
});
