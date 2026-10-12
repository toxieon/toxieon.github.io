import { LAZY_LOAD_EXTRA_MS, SCROLL_SETTLE_MS, CAPTURE_TYPES } from '../lib/constants.js';
import { putCapture, trimHistory } from '../lib/idb.js';
import { callPageTool } from './inject.js';
import { offscreenRequest } from './offscreen-manager.js';

function uuid() {
  return crypto.randomUUID();
}

async function waitForPaint(tabId, y) {
  await callPageTool(tabId, 'scrollToY', [y]);
  await new Promise((r) => setTimeout(r, SCROLL_SETTLE_MS));
}

export async function captureTabImage(tabId, options = {}) {
  const tab = await chrome.tabs.get(tabId);
  const metrics = await callPageTool(tabId, 'prepareForCapture', [
    { expandLazy: true, settleMs: SCROLL_SETTLE_MS, lazyMs: LAZY_LOAD_EXTRA_MS },
  ]);
  const plan = await callPageTool(tabId, 'buildScrollPlan', [metrics, options.overlapPx ?? 80]);
  const slices = [];

  for (const scrollY of plan.positions) {
    await waitForPaint(tabId, scrollY);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    slices.push({ scrollY, dataUrl });
  }

  await callPageTool(tabId, 'scrollToY', [metrics.scrollY]);

  const stitchResp = await offscreenRequest('stitch', {
    payload: { slices, metrics, overlapCss: plan.overlap },
  });
  if (!stitchResp?.ok) {
    throw new Error(stitchResp?.error || 'Stitch failed');
  }
  const { pngDataUrl, width, height } = stitchResp.result;

  let pdfDataUrl = null;
  try {
    const pdfResp = await offscreenRequest('imagePdf', {
      pngDataUrl,
      title: metrics.title,
      metrics,
    });
    if (pdfResp?.ok) pdfDataUrl = pdfResp.blob;
  } catch {
    /* optional */
  }

  const record = {
    id: uuid(),
    type: CAPTURE_TYPES.IMAGE,
    createdAt: Date.now(),
    title: metrics.title || 'Untitled page',
    url: metrics.url,
    metrics,
    pngDataUrl,
    pdfDataUrl,
    width,
    height,
    pageCount: 1,
  };
  if (!options.skipStore) {
    await putCapture(record);
    await trimHistory();
  }
  return record;
}
