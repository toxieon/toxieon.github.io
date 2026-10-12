import { getMultipageProject } from '../lib/idb-multipage.js';
import { buildCombinedHtml, visiblePages, pngDataUrlsToZip } from '../lib/combined-export.js';
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

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
