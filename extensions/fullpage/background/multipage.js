import { MULTIPAGE_SESSION_KEY } from '../lib/constants.js';
import { getMultipageProject, putMultipageProject } from '../lib/idb-multipage.js';
import { captureTabImage } from './capture-image.js';
import { captureTabRegion } from './capture-region.js';
import { getSettings } from '../lib/settings.js';
import { injectMultipageWidget, removeMultipageWidgetFromAllTabs } from './multipage-inject.js';

function uuid() {
  return crypto.randomUUID();
}

export async function getActiveSessionId() {
  const data = await chrome.storage.session.get(MULTIPAGE_SESSION_KEY);
  return data[MULTIPAGE_SESSION_KEY] || null;
}

export async function setActiveSessionId(id) {
  if (id) await chrome.storage.session.set({ [MULTIPAGE_SESSION_KEY]: id });
  else await chrome.storage.session.remove(MULTIPAGE_SESSION_KEY);
}

export function createEmptyProject(title = 'Multipage session') {
  const now = Date.now();
  return {
    id: uuid(),
    title,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    pages: [],
  };
}

export async function startMultipageSession(title) {
  const existing = await getActiveSessionId();
  if (existing) {
    const proj = await getMultipageProject(existing);
    if (proj?.status === 'active') return proj;
  }
  const project = createEmptyProject(title);
  await putMultipageProject(project);
  await setActiveSessionId(project.id);
  await injectMultipageWidgetAllTabs();
  return project;
}

export async function getActiveProject() {
  const id = await getActiveSessionId();
  if (!id) return null;
  return getMultipageProject(id);
}

async function injectMultipageWidgetAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && tab.url?.startsWith('http')) {
      injectMultipageWidget(tab.id).catch(() => {});
    }
  }
}

export async function endMultipageSession(keepProject = true) {
  await removeMultipageWidgetFromAllTabs();
  const id = await getActiveSessionId();
  if (id && keepProject) {
    const proj = await getMultipageProject(id);
    if (proj) {
      proj.status = 'editing';
      await putMultipageProject(proj);
    }
  }
  await setActiveSessionId(null);
}

export async function captureRegionToSession(tabId, region) {
  const project = await getActiveProject();
  if (!project || project.status !== 'active') {
    throw new Error('Multipage mode is not active. Start it from the extension menu.');
  }
  const settings = await getSettings();
  const record = await captureTabRegion(tabId, region, {
    skipStore: true,
    skipProgress: true,
    expandLazy: false,
    overlapPx: settings.overlapPx,
  });
  const page = {
    id: uuid(),
    order: project.pages.length,
    hidden: false,
    title: record.title || 'Region',
    url: record.url,
    capturedAt: Date.now(),
    pngDataUrl: record.pngDataUrl,
    html: record.html,
    pageText: record.pageText,
    textLayer: record.textLayer,
    metrics: record.metrics,
    width: record.width,
    height: record.height,
    pdfDataUrl: record.pdfDataUrl,
    region: record.region,
  };
  project.pages.push(page);
  await putMultipageProject(project);
  await broadcastSessionState();
  return { project, page, pageCount: project.pages.length };
}

export async function capturePageToSession(tabId) {
  const project = await getActiveProject();
  if (!project || project.status !== 'active') {
    throw new Error('Multipage mode is not active. Start it from the extension menu.');
  }
  const settings = await getSettings();
  const record = await captureTabImage(tabId, {
    skipStore: true,
    skipProgress: true,
    expandLazy: false,
    overlapPx: settings.overlapPx,
    onProgress: async () => {},
  });
  const page = {
    id: uuid(),
    order: project.pages.length,
    hidden: false,
    title: record.title || 'Untitled',
    url: record.url,
    capturedAt: Date.now(),
    pngDataUrl: record.pngDataUrl,
    html: record.html,
    pageText: record.pageText,
    textLayer: record.textLayer,
    metrics: record.metrics,
    width: record.width,
    height: record.height,
    pdfDataUrl: record.pdfDataUrl,
  };
  project.pages.push(page);
  await putMultipageProject(project);
  await broadcastSessionState();
  return { project, page, pageCount: project.pages.length };
}

export async function undoLastPage() {
  const project = await getActiveProject();
  if (!project?.pages?.length) throw new Error('Nothing to undo');
  project.pages.pop();
  project.pages.forEach((p, i) => {
    p.order = i;
  });
  await putMultipageProject(project);
  await broadcastSessionState();
  return { project, pageCount: project.pages.length };
}

export async function finishMultipageSession() {
  const project = await getActiveProject();
  if (!project) throw new Error('No active multipage session');
  await endMultipageSession(true);
  const url = chrome.runtime.getURL(`multipage/editor.html?id=${encodeURIComponent(project.id)}`);
  await chrome.tabs.create({ url });
  return project;
}

export async function updateMultipageProject(project) {
  project.pages.forEach((p, i) => {
    p.order = i;
  });
  await putMultipageProject(project);
  return project;
}

async function broadcastSessionState() {
  const project = await getActiveProject();
  const payload = {
    type: 'MULTIPAGE_STATE',
    sessionId: project?.id,
    pageCount: project?.pages?.length ?? 0,
    title: project?.title,
  };
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, payload);
    } catch {
      /* no widget */
    }
  }
}

export async function onTabReadyForWidget(tabId, url) {
  if (!url?.startsWith('http')) return;
  const id = await getActiveSessionId();
  if (!id) return;
  const proj = await getMultipageProject(id);
  if (proj?.status === 'active') await injectMultipageWidget(tabId);
}
