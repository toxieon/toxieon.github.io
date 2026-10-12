const OFFSCREEN_URL = 'offscreen/offscreen.html';

export async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  if (existing.length) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['DOM_PARSER', 'BLOBS'],
    justification: 'Stitch screenshots and build PDFs locally',
  });
}

export async function offscreenRequest(action, data = {}) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: 'offscreen', action, ...data });
}
