import {
  LAZY_LOAD_EXTRA_MS,
  SCROLL_SETTLE_MS,
  CAPTURE_TYPES,
  CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS,
} from '../lib/constants.js';
import { putCapture, trimHistory } from '../lib/idb.js';
import { getSettings } from '../lib/settings.js';
import { callPageTool } from './inject.js';
import { offscreenRequest } from './offscreen-manager.js';

function uuid() {
  return crypto.randomUUID();
}

let lastCaptureVisibleTabAt = 0;

async function captureVisiblePng(windowId, tabId, sliceIndex) {
  await callPageTool(tabId, 'beforeCaptureSlice', [sliceIndex]).catch(() => {});
  const now = Date.now();
  const wait = CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS - (now - lastCaptureVisibleTabAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  } catch {
    await new Promise((r) => setTimeout(r, CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS));
    dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  }
  lastCaptureVisibleTabAt = Date.now();
  if (!dataUrl) throw new Error('Screenshot failed (captureVisibleTab returned empty).');
  return dataUrl;
}

export async function captureTabImage(tabId, options = {}) {
  const onProgress = options.onProgress;
  const tab = await chrome.tabs.get(tabId);
  await onProgress?.(5, 'Preparing page…');
  const metrics = await callPageTool(tabId, 'prepareForCapture', [
    {
      expandLazy: options.expandLazy !== false,
      settleMs: SCROLL_SETTLE_MS,
      lazyMs: LAZY_LOAD_EXTRA_MS,
    },
  ]);
  const plan = await callPageTool(tabId, 'buildScrollPlan', [metrics, options.overlapPx ?? 80]);
  const slices = [];
  const scrollLog = [];
  const total = plan.positions.length;

  for (let i = 0; i < plan.positions.length; i++) {
    const scrollY = plan.positions[i];
    const pct = 10 + Math.round((i / total) * 70);
    await onProgress?.(pct, `Screenshot ${i + 1} of ${total}`);

    const verify = await callPageTool(tabId, 'scrollToCaptureY', [scrollY, i]);
    scrollLog.push(verify);
    if (verify.duplicate) {
      if (i === 0) {
        throw new Error('Page did not scroll for capture. Try scrolling the main content manually first.');
      }
      break;
    }
    await new Promise((r) => setTimeout(r, SCROLL_SETTLE_MS));
    const dataUrl = await captureVisiblePng(tab.windowId, tabId, i);
    slices.push({ scrollY: verify.actualY, dataUrl });
  }

  if (slices.length < 1) {
    throw new Error('No screenshots captured.');
  }

  await callPageTool(tabId, 'restoreScrollPosition', []);
  await onProgress?.(85, 'Stitching image…');

  const stitchResp = await offscreenRequest('stitch', {
    payload: { slices, metrics, overlapCss: plan.overlap },
  });
  if (!stitchResp?.ok) {
    throw new Error(stitchResp?.error || 'Stitch failed');
  }
  const { pngDataUrl, width, height } = stitchResp.result;

  await onProgress?.(92, 'Building PDF…');
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
    scrollLog,
  };
  if (!options.skipStore) {
    await putCapture(record);
    const settings = await getSettings();
    await trimHistory(settings.historyLimit);
  }
  await onProgress?.(100, 'Done');
  return record;
}
