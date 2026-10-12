import { CAPTURE_TYPES, DEFAULT_SCAN_LIMIT } from '../lib/constants.js';
import { putCapture, trimHistory } from '../lib/idb.js';
import { getSettings } from '../lib/settings.js';
import { callPageTool, ensurePageTools } from './inject.js';
import { captureTabReconstruct } from './capture-reconstruct.js';
import { captureTabImage } from './capture-image.js';
import { offscreenRequest } from './offscreen-manager.js';

function uuid() {
  return crypto.randomUUID();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCombinedHtml(pages, rootTitle) {
  const toc = pages
    .map(
      (p, i) =>
        `<li><a href="#fullpage-page-${i + 1}">${escapeHtml(p.title || `Page ${i + 1}`)}</a> <small>${escapeHtml(p.url)}</small></li>`
    )
    .join('\n');
  const sections = pages
    .map((p, i) => {
      const bodyMatch = p.html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      const inner = bodyMatch ? bodyMatch[1] : p.html;
      return `<section id="fullpage-page-${i + 1}" data-url="${escapeHtml(p.url)}"><header><h2>${escapeHtml(p.title || `Page ${i + 1}`)}</h2><p><a href="${escapeHtml(p.url)}">${escapeHtml(p.url)}</a></p></header>${inner}</section>`;
    })
    .join('\n<hr data-fullpage-divider>\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(rootTitle)} — Full scan</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 1rem 1.5rem; }
  nav#fullpage-toc { background: #f4f4f5; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; }
  nav#fullpage-toc ol { margin: 0; padding-left: 1.25rem; }
  section { margin-bottom: 2rem; }
  section > header { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #ddd; padding: 0.5rem 0; }
</style>
</head>
<body>
<nav id="fullpage-toc"><h1>${escapeHtml(rootTitle)}</h1><p>Table of contents</p><ol>${toc}</ol></nav>
${sections}
</body>
</html>`;
}

async function navigateTab(tabId, url) {
  await chrome.tabs.update(tabId, { url });
  await waitForTabComplete(tabId);
  await ensurePageTools(tabId);
}

function waitForTabComplete(tabId, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = async () => {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Navigation timeout'));
        return;
      }
      setTimeout(check, 250);
    };
    check();
  });
}

export async function captureFullScan(tabId, options = {}) {
  const onProgress = options.onProgress;
  const mode = options.mode || 'reconstruct';
  const pageLimit = Math.min(options.pageLimit ?? DEFAULT_SCAN_LIMIT, 100);
  const tabIds = options.tabIds?.length ? options.tabIds : [tabId];
  const followPagination = options.followPagination !== false;

  const pages = [];
  const visited = new Set();
  await onProgress?.(5, 'Starting full scan…');

  for (const tid of tabIds) {
    if (pages.length >= pageLimit) break;
    let currentTabId = tid;
    let firstUrl = (await chrome.tabs.get(currentTabId)).url;
    const queue = [firstUrl];

    while (queue.length && pages.length < pageLimit) {
      const url = queue.shift();
      const key = url.split('#')[0];
      if (visited.has(key)) continue;
      visited.add(key);

      if ((await chrome.tabs.get(currentTabId)).url?.split('#')[0] !== key) {
        await navigateTab(currentTabId, url);
      } else {
        await waitForTabComplete(currentTabId);
        await ensurePageTools(currentTabId);
      }

      const pageNum = pages.length + 1;
      const pct = Math.min(85, 10 + Math.round((pageNum / pageLimit) * 70));
      await onProgress?.(pct, `Capturing page ${pageNum} of up to ${pageLimit}…`);

      let record;
      const innerOpts = { ...options, skipStore: true, onProgress: undefined };
      if (mode === 'image') {
        record = await captureTabImage(currentTabId, innerOpts);
        pages.push({
          title: record.title,
          url: record.url,
          html: `<p><img alt="screenshot" src="${record.pngDataUrl}" style="max-width:100%"></p>`,
          pngDataUrl: record.pngDataUrl,
        });
      } else {
        record = await captureTabReconstruct(currentTabId, innerOpts);
        pages.push({ title: record.title, url: record.url, html: record.html });
      }

      if (followPagination && pages.length < pageLimit) {
        const links = await callPageTool(currentTabId, 'findPaginationLinks', [8]);
        for (const link of links.slice(0, 2)) {
          const lk = link.split('#')[0];
          if (!visited.has(lk) && !queue.includes(link)) queue.push(link);
        }
      }
    }
  }

  const rootTitle = pages[0]?.title || 'Full scan';
  const combinedHtml = buildCombinedHtml(pages, rootTitle);

  await onProgress?.(90, 'Combining pages & building PDF…');
  const id = uuid();
  let pdfDataUrl = null;
  try {
    const pdfResp = await offscreenRequest('htmlPdf', {
      html: combinedHtml,
      title: rootTitle,
      meta: { url: pages[0]?.url },
    });
    if (pdfResp?.ok) pdfDataUrl = pdfResp.blob;
  } catch {
    /* optional */
  }

  const record = {
    id,
    type: CAPTURE_TYPES.FULLSCAN,
    createdAt: Date.now(),
    title: `${rootTitle} (${pages.length} pages)`,
    url: pages[0]?.url,
    html: combinedHtml,
    pdfDataUrl,
    pageCount: pages.length,
    pages,
    metrics: { pageCount: pages.length },
  };
  await putCapture(record);
  const settings = await getSettings();
  await trimHistory(settings.historyLimit);
  await onProgress?.(100, 'Done');
  return record;
}
