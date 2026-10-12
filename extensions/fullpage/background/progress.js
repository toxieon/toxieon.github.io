import { getSettings } from '../lib/settings.js';

const OVERLAY_FILE = 'content/progress-overlay.js';

export async function ensureProgressOverlay(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [OVERLAY_FILE],
    });
  } catch {
    /* restricted pages */
  }
}

export async function progressUpdate(tabId, payload) {
  const settings = await getSettings();
  if (!settings.showProgressOverlay) return;
  await ensureProgressOverlay(tabId);
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'FULLPAGE_PROGRESS_SHOW',
      payload,
    });
  } catch {
    /* tab may not have listener yet */
  }
}

export async function progressHide(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'FULLPAGE_PROGRESS_HIDE' });
  } catch {
    /* ignore */
  }
}

export function createProgressReporter(tabId, title = 'Capturing page…') {
  return async (percent, detail) => {
    await progressUpdate(tabId, { title, percent, detail });
  };
}
