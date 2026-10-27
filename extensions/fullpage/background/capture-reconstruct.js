import { CAPTURE_TYPES } from '../lib/constants.js';
import { putCapture, trimHistory } from '../lib/idb.js';
import { getSettings } from '../lib/settings.js';
import { callPageTool } from './inject.js';
import { offscreenRequest } from './offscreen-manager.js';

function uuid() {
  return crypto.randomUUID();
}

export async function captureTabReconstruct(tabId, options = {}) {
  const onProgress = options.onProgress;
  await onProgress?.(10, 'Expanding lazy content…');
  await callPageTool(tabId, 'prepareForCapture', [{ expandLazy: true }]);
  await onProgress?.(40, 'Inlining styles & images…');
  const bundle = await callPageTool(tabId, 'captureTextBundle', [
    { inlineImages: options.inlineImages !== false },
  ]);
  await callPageTool(tabId, 'restoreScrollPosition', []).catch(() => {});
  const html = bundle.html;
  const metrics = await callPageTool(tabId, 'getPageMetrics', []);

  await onProgress?.(80, 'Building searchable PDF…');
  let pdfDataUrl = null;
  try {
    const pdfResp = await offscreenRequest('htmlPdf', {
      html,
      title: metrics.title,
      meta: { url: metrics.url },
    });
    if (pdfResp?.ok) pdfDataUrl = pdfResp.blob;
  } catch {
    /* optional */
  }

  const record = {
    id: uuid(),
    type: CAPTURE_TYPES.RECONSTRUCT,
    createdAt: Date.now(),
    title: metrics.title || 'Untitled page',
    url: metrics.url,
    metrics,
    html,
    pdfDataUrl,
    pageText: bundle.pageText,
    textLayer: bundle.textLayer,
    pageCount: 1,
    searchable: true,
    pages: [{ title: metrics.title, url: metrics.url, html }],
  };
  if (!options.skipStore) {
    await putCapture(record);
    const settings = await getSettings();
    await trimHistory(settings.historyLimit);
  }
  await onProgress?.(100, 'Done');
  return record;
}
