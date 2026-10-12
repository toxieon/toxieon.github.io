import { getMultipageProject } from '../lib/idb-multipage.js';
import {
  buildCombinedHtml,
  buildPageHtml,
  visiblePages,
  pngDataUrlsToZip,
  pageExportFileName,
  dataUrlToBytes,
  storeOnlyZip,
} from '../lib/combined-export.js';
import { offscreenRequest } from './offscreen-manager.js';

export async function exportProjectPng(projectId) {
  const project = await getMultipageProject(projectId);
  if (!project) throw new Error('Project not found');
  const pages = visiblePages(project);
  const urls = pages.map((p) => p.pngDataUrl).filter(Boolean);
  if (!urls.length) throw new Error('No images to export');
  if (urls.length === 1) return { ok: true, pngDataUrl: urls[0] };
  const stack = await offscreenRequest('verticalStackPng', { pngDataUrls: urls });
  if (stack?.ok) return { ok: true, pngDataUrl: stack.result.pngDataUrl };
  const zip = pngDataUrlsToZip(urls, pages.map((p) => p.title));
  const zipDataUrl = await blobToDataUrl(zip);
  return { ok: true, zip: zipDataUrl };
}

export async function exportProjectPdf(projectId) {
  const project = await getMultipageProject(projectId);
  if (!project) throw new Error('Project not found');
  const html = buildCombinedHtml(project);
  const pdfResp = await offscreenRequest('htmlPdf', {
    html,
    title: project.title,
    meta: { url: project.pages?.[0]?.url },
  });
  if (!pdfResp?.ok) throw new Error(pdfResp?.error || 'PDF export failed');
  return { ok: true, pdfDataUrl: pdfResp.blob };
}

const SEPARATE_FORMATS = new Set(['png', 'pdf', 'html']);

export async function exportProjectSeparate(projectId, format) {
  const project = await getMultipageProject(projectId);
  if (!project) throw new Error('Project not found');
  const pages = visiblePages(project);
  if (!pages.length) throw new Error('No pages to export');

  const fmt = String(format || 'png').toLowerCase();
  if (!SEPARATE_FORMATS.has(fmt)) throw new Error('Invalid export format');

  const files = [];
  if (fmt === 'png') {
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      if (!p.pngDataUrl) continue;
      files.push({
        name: pageExportFileName(i, p.title, 'png'),
        bytes: dataUrlToBytes(p.pngDataUrl),
      });
    }
  } else if (fmt === 'html') {
    for (let i = 0; i < pages.length; i++) {
      const html = buildPageHtml(pages[i], i);
      files.push({
        name: pageExportFileName(i, pages[i].title, 'html'),
        bytes: new TextEncoder().encode(html),
      });
    }
  } else {
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      let pdfDataUrl = null;
      if (p.pngDataUrl && p.textLayer) {
        const pdfResp = await offscreenRequest('searchableImagePdf', {
          pngDataUrl: p.pngDataUrl,
          textLayer: p.textLayer,
          metrics: p.metrics || { width: p.width, height: p.height, title: p.title },
          title: p.title,
        });
        if (pdfResp?.ok) pdfDataUrl = pdfResp.blob;
      }
      if (!pdfDataUrl && p.pdfDataUrl) pdfDataUrl = p.pdfDataUrl;
      if (!pdfDataUrl) {
        const pdfResp = await offscreenRequest('htmlPdf', {
          html: buildPageHtml(p, i),
          title: p.title,
          meta: { url: p.url },
        });
        if (pdfResp?.ok) pdfDataUrl = pdfResp.blob;
      }
      if (!pdfDataUrl) throw new Error(`PDF export failed for “${p.title || `page ${i + 1}`}”`);
      files.push({
        name: pageExportFileName(i, p.title, 'pdf'),
        bytes: dataUrlToBytes(pdfDataUrl),
      });
    }
  }

  if (!files.length) throw new Error('No exportable content for this format');
  const zip = storeOnlyZip(files);
  return { ok: true, zip: await blobToDataUrl(zip) };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
