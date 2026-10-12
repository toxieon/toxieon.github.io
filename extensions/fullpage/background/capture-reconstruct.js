import { CAPTURE_TYPES } from '../lib/constants.js';
import { putCapture, trimHistory } from '../lib/idb.js';
import { callPageTool } from './inject.js';
import { offscreenRequest } from './offscreen-manager.js';

function uuid() {
  return crypto.randomUUID();
}

export async function captureTabReconstruct(tabId, options = {}) {
  await callPageTool(tabId, 'prepareForCapture', [{ expandLazy: true }]);
  const html = await callPageTool(tabId, 'reconstructHtml', [
    { inlineImages: options.inlineImages !== false },
  ]);
  const metrics = await callPageTool(tabId, 'getPageMetrics', []);

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
    pageCount: 1,
    pages: [{ title: metrics.title, url: metrics.url, html }],
  };
  if (!options.skipStore) {
    await putCapture(record);
    await trimHistory();
  }
  return record;
}
