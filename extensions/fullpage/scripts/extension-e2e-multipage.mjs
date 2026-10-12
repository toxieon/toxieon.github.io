/**
 * Multipage mode: start, capture, undo, reorder, hide, export/import .nfp
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'manifest.json');
const manifestOriginal = fs.readFileSync(manifestPath, 'utf8');

function useTestHostPermissions() {
  const m = JSON.parse(manifestOriginal);
  m.host_permissions = ['<all_urls>'];
  delete m.optional_host_permissions;
  fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));
}

function restoreManifest() {
  fs.writeFileSync(manifestPath, manifestOriginal);
}

useTestHostPermissions();

const PORT = 4202;
const testFile = 'multipage-short.html';

function serveTest(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const base = path.basename((req.url || '/').split('?')[0]);
      const file = path.join(root, 'test', !base || base === '/' ? testFile : base);
      const testDir = path.join(root, 'test');
      if (!file.startsWith(testDir) || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(file));
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

const server = await serveTest(PORT);
const baseUrl = `http://127.0.0.1:${PORT}/${testFile}`;

const browser = await puppeteer.launch({
  headless: false,
  protocolTimeout: 300000,
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-sandbox'],
});

const swTarget = await browser.waitForTarget(
  (t) => t.type() === 'service_worker' && t.url().includes('background/service-worker.js'),
  { timeout: 15000 }
);
const extensionId = new URL(swTarget.url()).host;

const page = await browser.newPage();
await page.goto(baseUrl, { waitUntil: 'networkidle0' });

const harness = await browser.newPage();
await harness.goto(`chrome-extension://${extensionId}/popup/popup.html`);

const start = await harness.evaluate(() => chrome.runtime.sendMessage({ type: 'MULTIPAGE_START' }));
if (!start?.ok) {
  console.error('FAIL: start multipage', start);
  process.exit(1);
}

await page.waitForSelector('#neill-multipage-root', { timeout: 10000 });

async function captureActiveTab(port) {
  return harness.evaluate(async (p) => {
    const [tab] = await chrome.tabs.query({ url: `http://127.0.0.1:${p}/*` });
    if (!tab?.id) throw new Error('tab not found');
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => chrome.runtime.sendMessage({ type: 'MULTIPAGE_CAPTURE' }),
    });
    return result;
  }, port);
}

await page.bringToFront();
const cap1b = await captureActiveTab(PORT);
if (!cap1b?.ok) {
  console.error('FAIL: capture 1', cap1b);
  process.exit(1);
}

await page.goto(`${baseUrl}?p=2`, { waitUntil: 'networkidle0' });
await page.waitForSelector('#neill-multipage-root', { timeout: 10000 });
await page.bringToFront();
const cap2 = await captureActiveTab(PORT);
if (!cap2?.ok) {
  console.error('FAIL: capture 2', cap2);
  process.exit(1);
}

const undo = await harness.evaluate(() => chrome.runtime.sendMessage({ type: 'MULTIPAGE_UNDO' }));
if (!undo?.ok || undo.pageCount !== 1) {
  console.error('FAIL: undo', undo);
  process.exit(1);
}

const finish = await harness.evaluate(() => chrome.runtime.sendMessage({ type: 'MULTIPAGE_FINISH' }));
if (!finish?.ok) {
  console.error('FAIL: finish', finish);
  process.exit(1);
}

const editorTarget = await browser.waitForTarget(
  (t) => t.type() === 'page' && t.url().includes('multipage/editor.html'),
  { timeout: 60000 }
);
const editorPage = await editorTarget.page();

const reorderHide = await editorPage.evaluate(async () => {
  const id = new URL(location.href).searchParams.get('id');
  const load = await chrome.runtime.sendMessage({ type: 'MULTIPAGE_LOAD', id });
  const project = load.project;
  if (project.pages.length < 1) return { ok: false, reason: 'no pages' };
  if (project.pages.length > 1) {
    const [a, b] = project.pages;
    project.pages = [b, a];
    project.pages.forEach((p, i) => {
      p.order = i;
    });
  }
  project.pages[0].hidden = true;
  project.pages[0].title = 'Renamed scan';
  const save = await chrome.runtime.sendMessage({ type: 'MULTIPAGE_SAVE', project });
  const nfp = await chrome.runtime.sendMessage({ type: 'MULTIPAGE_EXPORT_NFP', projectId: id });
  return { ok: save.ok && nfp.ok, hidden: save.project.pages[0].hidden, title: save.project.pages[0].title, nfp: nfp.payload };
});

if (!reorderHide.ok) {
  console.error('FAIL: reorder/hide/export', reorderHide);
  process.exit(1);
}

const importTest = await harness.evaluate(async (payload) => {
  const project = payload.project;
  project.id = crypto.randomUUID();
  project.pages[0].hidden = false;
  const save = await chrome.runtime.sendMessage({ type: 'MULTIPAGE_SAVE', project });
  const reload = await chrome.runtime.sendMessage({ type: 'MULTIPAGE_LOAD', id: save.project.id });
  return { ok: reload.ok && !reload.project.pages[0].hidden, id: save.project.id };
}, reorderHide.nfp);

if (!importTest.ok) {
  console.error('FAIL: import roundtrip', importTest);
  process.exit(1);
}

console.log('OK multipage e2e — pages after undo: 1, import id:', importTest.id);

await browser.close();
server.close();
restoreManifest();
process.exit(0);
