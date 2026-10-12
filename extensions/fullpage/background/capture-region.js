import { CAPTURE_TYPES } from '../lib/constants.js';
import { putCapture, trimHistory } from '../lib/idb.js';
import { getSettings } from '../lib/settings.js';
import { offscreenRequest } from './offscreen-manager.js';
import { captureTabImage } from './capture-image.js';
import { callPageTool } from './inject.js';
import { SCROLL_SETTLE_MS, CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS } from '../lib/constants.js';
import {
  cropHtmlForRegion,
  filterPageTextForRegion,
  filterTextLayerForRegion,
  normalizeRegion,
} from '../lib/region-crop.js';

function uuid() {
  return crypto.randomUUID();
}

async function cropPngOnTab(tabId, pngDataUrl, region, dpr) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    func: async (url, reg, ratio) => {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const sx = Math.max(0, Math.round(reg.x * ratio));
      const sy = Math.max(0, Math.round(reg.y * ratio));
      const sw = Math.max(1, Math.min(Math.round(reg.width * ratio), img.width - sx));
      const sh = Math.max(1, Math.min(Math.round(reg.height * ratio), img.height - sy));
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      return { pngDataUrl: canvas.toDataURL('image/png'), width: sw, height: sh };
    },
    args: [pngDataUrl, region, dpr],
  });
  if (!result?.pngDataUrl) throw new Error('Region crop failed');
  return result;
}

async function captureRegionSingleViewport(tabId, region, options = {}) {
  const r = normalizeRegion(region);
  const tab = await chrome.tabs.get(tabId);
  await callPageTool(tabId, 'prepareForCapture', [{ expandLazy: false }]);
  await callPageTool(tabId, 'scrollToCaptureY', [r.y, 0]);
  await new Promise((res) => setTimeout(res, SCROLL_SETTLE_MS));
  await callPageTool(tabId, 'beforeCaptureSlice', [0]);
  await new Promise((res) => setTimeout(res, CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS));
  const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  if (!shot?.startsWith('data:image')) throw new Error('captureVisibleTab returned empty');
  await callPageTool(tabId, 'restoreScrollPosition', []);
  const textBundle = await callPageTool(tabId, 'captureTextBundle', [{ inlineImages: true }]);
  const metrics = await callPageTool(tabId, 'getPageMetrics', []);
  const cropRegion = {
    x: r.x,
    y: 0,
    width: r.width,
    height: Math.min(r.height, metrics.viewportHeight || r.height),
  };
  const dpr = metrics.devicePixelRatio || 1;
  const [{ result: cropped }] = await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    func: async (url, reg, ratio) => {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const sx = Math.max(0, Math.round(reg.x * ratio));
      const sy = Math.max(0, Math.round(reg.y * ratio));
      const sw = Math.max(1, Math.min(Math.round(reg.width * ratio), img.width - sx));
      const sh = Math.max(1, Math.min(Math.round(reg.height * ratio), img.height - sy));
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      return { pngDataUrl: canvas.toDataURL('image/png'), width: sw, height: sh };
    },
    args: [shot, cropRegion, dpr],
  });
  if (!cropped?.pngDataUrl) throw new Error('Region crop failed');
  const textLayer = filterTextLayerForRegion(textBundle.textLayer, r);
  const html = textBundle.html ? cropHtmlForRegion(textBundle.html, r) : '';
  const pageText = filterPageTextForRegion(textBundle.pageText, textBundle.textLayer, r);
  return {
    title: metrics.title,
    url: metrics.url,
    metrics: { ...metrics, width: r.width, height: r.height },
    pngDataUrl: cropped.pngDataUrl,
    textLayer,
    html,
    pageText,
    scrollLog: [{ actualY: r.y }],
    width: cropped.width,
    height: cropped.height,
  };
}

export async function captureTabRegion(tabId, region, options = {}) {
  const r = normalizeRegion(region);
  const metrics = await callPageTool(tabId, 'getPageMetrics', []).catch(() => null);
  const useSingle =
    options.forceSingleViewport ||
    (metrics && r.height <= metrics.viewportHeight * 1.05 && r.width <= metrics.viewportWidth * 1.05);
  const full = useSingle
    ? await captureRegionSingleViewport(tabId, r, options)
    : await captureTabImage(tabId, {
        ...options,
        skipStore: true,
        skipProgress: options.skipProgress,
        regionClamp: r,
      });

  let pngDataUrl = full.pngDataUrl;
  let width = full.width;
  let height = full.height;
  let textLayer = full.textLayer;
  let html = full.html;
  let pageText = full.pageText;

  if (!useSingle) {
    const cropped = await cropPngOnTab(
      tabId,
      full.pngDataUrl,
      r,
      full.metrics?.devicePixelRatio || 1
    );
    pngDataUrl = cropped.pngDataUrl;
    width = cropped.width;
    height = cropped.height;
    textLayer = filterTextLayerForRegion(full.textLayer, r);
    html = full.html ? cropHtmlForRegion(full.html, r) : '';
    pageText = filterPageTextForRegion(full.pageText, full.textLayer, r);
  }

  let pdfDataUrl = full.pdfDataUrl;
  try {
    const pdfResp = await offscreenRequest('searchableImagePdf', {
      pngDataUrl,
      textLayer,
      metrics: { width: r.width, height: r.height, devicePixelRatio: 1 },
      title: full.title,
    });
    if (pdfResp?.ok) pdfDataUrl = pdfResp.blob;
  } catch {
    /* */
  }

  const record = {
    id: uuid(),
    type: CAPTURE_TYPES.REGION,
    createdAt: Date.now(),
    title: `${full.title || 'Region'} (selection)`,
    url: full.url,
    metrics: { ...full.metrics, width: r.width, height: r.height },
    region: r,
    pngDataUrl,
    pdfDataUrl,
    html,
    textLayer,
    pageText,
    width,
    height,
    pageCount: 1,
    scrollLog: full.scrollLog,
    searchable: true,
  };

  if (!options.skipStore) {
    await putCapture(record);
    const settings = await getSettings();
    await trimHistory(settings.historyLimit);
  }
  return record;
}
