import { captureTabImage } from './capture-image.js';
import { captureTabReconstruct } from './capture-reconstruct.js';
import { captureFullScan } from './capture-fullscan.js';
import { listCaptures, getCapture } from '../lib/idb.js';
import { getSettings } from '../lib/settings.js';
import { ensureOptionalHostAccess } from '../lib/permissions.js';
import {
  startMultipageSession,
  getActiveProject,
  capturePageToSession,
  undoLastPage,
  finishMultipageSession,
  endMultipageSession,
  updateMultipageProject,
  onTabReadyForWidget,
} from './multipage.js';
import { getMultipageProject, putMultipageProject } from '../lib/idb-multipage.js';
import { exportProjectPng, exportProjectPdf } from './multipage-export.js';
import { projectToNfpPayload } from '../lib/nfp-format.js';
import {
  createProgressReporter,
  progressHide,
  progressUpdate,
  openProgressWindow,
  showCaptureError,
} from './progress.js';

const BUSY_KEY = 'captureBusy';

const PROGRESS_TITLES = {
  image: 'Screen capture in progress…',
  reconstruct: 'Reconstructing searchable HTML…',
  fullscan: 'Running full scan…',
};

chrome.storage.session.set({ [BUSY_KEY]: false }).catch(() => {});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'multipage-start',
      title: 'Start multipage mode',
      contexts: ['action'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'multipage-start') {
    startMultipageSession().catch((err) => console.error('Multipage:', err));
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    onTabReadyForWidget(tabId, tab.url).catch(() => {});
  }
});

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

async function resolveCaptureTab(options = {}) {
  if (options.tabId) {
    return chrome.tabs.get(options.tabId);
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

async function ensureCapturePermissions(kind) {
  if (kind !== 'fullscan') return;
  const ok = await ensureOptionalHostAccess();
  if (!ok) {
    throw new Error(
      'Full scan needs permission to access pages on this site. Allow when Chrome prompts, then try again.'
    );
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

  await ensureCapturePermissions(kind);

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

chrome.action.onClicked.addListener((tab) => {
  const tabId = tab?.id;
  getSettings()
    .then((settings) => runCapture(settings.toolbarCaptureMode || 'image', tabId ? { tabId } : {}))
    .catch((err) => console.error('Full Page Capture:', err));
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target === 'offscreen') return false;
  if (message.type === 'FULLPAGE_CAPTURE') {
    runCapture(message.kind, message.options || {})
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
  if (message.type === 'FULLPAGE_OPEN_VIEWER') {
    if (message.id) openViewer(message.id);
    else openHistory();
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'FULLPAGE_OPEN_OPTIONS') {
    openOptions();
    sendResponse({ ok: true });
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
  if (message.type === 'FULLPAGE_GET_CAPTURE') {
    getCapture(message.id)
      .then((record) => sendResponse({ ok: Boolean(record), record }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (message.type === 'MULTIPAGE_START') {
    startMultipageSession(message.title)
      .then((p) => sendResponse({ ok: true, projectId: p.id, pageCount: 0 }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
  if (message.type === 'MULTIPAGE_GET_STATE') {
    getActiveProject()
      .then((p) =>
        sendResponse({
          ok: true,
          active: Boolean(p && p.status === 'active'),
          sessionId: p?.id,
          pageCount: p?.pages?.length ?? 0,
        })
      )
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (message.type === 'MULTIPAGE_CAPTURE') {
    const tabId = _sender.tab?.id ?? message.tabId;
    if (!tabId) {
      sendResponse({ ok: false, error: 'No tab for capture' });
      return true;
    }
    capturePageToSession(tabId)
      .then((r) => sendResponse({ ok: true, pageCount: r.pageCount, pageId: r.page.id }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
  if (message.type === 'MULTIPAGE_UNDO') {
    undoLastPage()
      .then((r) => sendResponse({ ok: true, pageCount: r.pageCount }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
  if (message.type === 'MULTIPAGE_FINISH') {
    finishMultipageSession()
      .then((p) => sendResponse({ ok: true, projectId: p.id }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
  if (message.type === 'MULTIPAGE_END') {
    endMultipageSession(true)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (message.type === 'MULTIPAGE_LOAD') {
    getMultipageProject(message.id)
      .then((project) => sendResponse({ ok: Boolean(project), project }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (message.type === 'MULTIPAGE_SAVE') {
    updateMultipageProject(message.project)
      .then((project) => sendResponse({ ok: true, project }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (message.type === 'MULTIPAGE_EXPORT_PNG') {
    exportProjectPng(message.projectId)
      .then((r) => sendResponse(r))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
  if (message.type === 'MULTIPAGE_EXPORT_PDF') {
    exportProjectPdf(message.projectId)
      .then((r) => sendResponse(r))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
  if (message.type === 'MULTIPAGE_EXPORT_NFP') {
    getMultipageProject(message.projectId)
      .then((project) => {
        if (!project) throw new Error('Not found');
        sendResponse({ ok: true, payload: projectToNfpPayload(project) });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
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
  if (kind) runCapture(kind).catch((err) => console.error('Full Page Capture:', err));
});
