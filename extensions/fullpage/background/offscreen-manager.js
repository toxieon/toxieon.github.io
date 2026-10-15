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

export async function offscreenRequest(action, data = {}, timeoutMs = 90000) {
  await ensureOffscreen();
  const message = { target: 'offscreen', action, ...data };
  const response = await Promise.race([
    chrome.runtime.sendMessage(message),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Offscreen action "${action}" timed out`)), timeoutMs)
    ),
  ]);
  return response;
}
