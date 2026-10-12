const REGION_FILE = 'content/region-select.js';

let pending = null;

export function waitForRegionSelection(tabId) {
  if (pending) pending.reject(new Error('Region selection replaced'));
  return new Promise((resolve, reject) => {
    pending = { resolve, reject, tabId };
    chrome.scripting
      .executeScript({ target: { tabId, allFrames: false }, files: [REGION_FILE] })
      .catch((err) => {
        pending = null;
        reject(err);
      });
  });
}

export function completeRegionSelection(region) {
  if (!pending) return false;
  const { resolve } = pending;
  pending = null;
  resolve(region);
  return true;
}

export function cancelRegionSelection() {
  if (!pending) return false;
  const { reject } = pending;
  pending = null;
  reject(new Error('Region selection cancelled'));
  return true;
}
