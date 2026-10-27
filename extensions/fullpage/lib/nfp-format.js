import { NFP_FORMAT_VERSION } from './constants.js';

export function projectToNfpPayload(project) {
  return {
    format: 'nfp',
    version: NFP_FORMAT_VERSION,
    exportedAt: Date.now(),
    project: {
      id: project.id,
      title: project.title,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      pages: (project.pages || []).map((p) => ({
        id: p.id,
        order: p.order,
        hidden: Boolean(p.hidden),
        title: p.title,
        url: p.url,
        capturedAt: p.capturedAt,
        pngDataUrl: p.pngDataUrl,
        html: p.html,
        pageText: p.pageText,
        textLayer: p.textLayer,
        metrics: p.metrics,
        width: p.width,
        height: p.height,
      })),
    },
  };
}

export function parseNfpFile(text) {
  const data = JSON.parse(text);
  if (data.format !== 'nfp' || !data.project) {
    throw new Error('Invalid .nfp project file');
  }
  const project = data.project;
  project.pages = (project.pages || []).sort((a, b) => a.order - b.order);
  return project;
}

export function downloadNfpBlob(project) {
  const payload = projectToNfpPayload(project);
  const json = JSON.stringify(payload);
  return new Blob([json], { type: 'application/vnd.neill-fullpage+nfp+json' });
}
