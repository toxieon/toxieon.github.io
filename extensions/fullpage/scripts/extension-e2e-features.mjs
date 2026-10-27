/**
 * Region capture, redaction export, clipboard API surface.
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

const PORT = 4203;
const testFile = 'multipage-short.html';

function serveTest(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const base = path.basename((req.url || '/').split('?')[0]);
      const file = path.join(root, 'test', !base || base === '/' ? testFile : base);
      if (!file.startsWith(path.join(root, 'test')) || !fs.existsSync(file)) {
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
await page.bringToFront();

const harness = await browser.newPage();
await harness.goto(`chrome-extension://${extensionId}/popup/popup.html`);

const regionCap = await harness.evaluate(
  async (port) => {
    const [tab] = await chrome.tabs.query({ url: `http://127.0.0.1:${port}/*` });
    return chrome.runtime.sendMessage({
      type: 'FULLPAGE_CAPTURE',
      kind: 'region',
      options: {
        tabId: tab.id,
        region: { x: 16, y: 16, width: 220, height: 72 },
        expandLazy: false,
        forceSingleViewport: true,
      },
    });
  },
  PORT
);

if (!regionCap?.ok) {
  console.error('FAIL: region capture', regionCap);
  process.exit(1);
}

const meta = await harness.evaluate((id) =>
  chrome.runtime.sendMessage({ type: 'FULLPAGE_GET_CAPTURE', id })
, regionCap.id);

if (!meta.record?.pngDataUrl || !meta.record?.html) {
  console.error('FAIL: region record missing assets');
  process.exit(1);
}
if (meta.record.type !== 'region') {
  console.error('FAIL: expected region type', meta.record.type);
  process.exit(1);
}

const viewerTarget = await browser.waitForTarget(
  (t) => t.type() === 'page' && t.url().includes('viewer/viewer.html'),
  { timeout: 120000 }
);
const viewerPage = await viewerTarget.page();
await viewerPage.waitForFunction(() => globalThis.__fullpageViewer?.getCurrentRecord()?.pngDataUrl, {
  timeout: 60000,
});

const redact = await viewerPage.evaluate(() => {
  const rec = globalThis.__fullpageViewer.getCurrentRecord();
  const secret = 'Multipage marker A';
  if (!rec.pageText?.includes(secret)) return { ok: false, reason: 'missing marker' };
  const text = globalThis.__fullpageViewer.applyTestRedaction({
    x: 0,
    y: 0,
    width: 400,
    height: 80,
    mode: 'black',
  });
  return { ok: !text.includes(secret), text: text.slice(0, 80) };
});

if (!redact.ok) {
  console.error('FAIL: redaction should remove searchable text', redact);
  process.exit(1);
}

let copyOk = false;
try {
  copyOk = await viewerPage.evaluate(async () => {
    await globalThis.__fullpageViewer.copyPngToClipboard();
    return true;
  });
} catch {
  copyOk = false;
}
if (!copyOk) {
  const hasApi = await viewerPage.evaluate(
    () => typeof globalThis.__fullpageViewer?.copyPngToClipboard === 'function'
  );
  if (!hasApi) {
    console.error('FAIL: copy API missing');
    process.exit(1);
  }
}

console.log('OK features e2e — region, redact, copy API');

await browser.close();
server.close();
restoreManifest();
process.exit(0);
