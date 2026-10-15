import { getSettings } from '../lib/settings.js';

const OVERLAY_FILE = 'content/progress-overlay.js';
let progressWindowId = null;
const keepalivePorts = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'fullpage-progress') {
    keepalivePorts.add(port);
    port.onDisconnect.addListener(() => keepalivePorts.delete(port));
  }
});

export async function openProgressWindow() {
  if (progressWindowId != null) {
    try {
      await chrome.windows.update(progressWindowId, { focused: false });
      return progressWindowId;
    } catch {
      progressWindowId = null;
    }
  }
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('capture/progress.html'),
    type: 'popup',
    width: 336,
    height: 168,
    focused: true,
  });
  progressWindowId = win.id;
  return progressWindowId;
}

export async function closeProgressWindow(delayMs = 0) {
  if (progressWindowId == null) return;
  const id = progressWindowId;
  const close = async () => {
    try {
      await chrome.windows.remove(id);
    } catch {
      /* already closed */
    }
    if (progressWindowId === id) progressWindowId = null;
  };
  if (delayMs > 0) setTimeout(close, delayMs);
  else await close();
}

async function broadcast(payload) {
  try {
    await chrome.runtime.sendMessage({
      type: 'FULLPAGE_PROGRESS_BROADCAST',
      payload,
    });
  } catch {
    /* no listeners */
  }
}

export async function ensureProgressOverlay(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: [OVERLAY_FILE],
    });
  } catch {
    /* restricted pages */
  }
}

export async function progressUpdate(tabId, payload) {
  await broadcast(payload);
  const settings = await getSettings();
  if (!settings.showProgressOverlay) return;
  await ensureProgressOverlay(tabId);
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'FULLPAGE_PROGRESS_SHOW',
      payload,
    });
  } catch {
    /* optional in-page overlay */
  }
}

export async function progressHide(tabId, opts = {}) {
  if (!opts.keepOpenOnError) {
    await broadcast({ title: 'Done', percent: 100, detail: '' });
    await closeProgressWindow(400);
  }
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'FULLPAGE_PROGRESS_HIDE' });
  } catch {
    /* ignore */
  }
}

export function createProgressReporter(tabId, title = 'Screen capture in progress…') {
  return async (percent, detail) => {
    await progressUpdate(tabId, { title, percent, detail });
  };
}

export async function showCaptureError(detail, title = 'Capture failed') {
  await broadcast({ title, percent: 100, detail, error: true });
  try {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#c5221f' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 8000);
  } catch {
    /* ignore */
  }
  await closeProgressWindow(6000);
}
