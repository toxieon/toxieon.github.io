/**
 * Puppeteer E2E: unpacked extension, Moodle Boost fixture, distinct scroll slices, viewer downloads.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'manifest.json');
const manifestOriginal = fs.readFileSync(manifestPath, 'utf8');

/** Automation only: load extension with host access (store build uses optional_host_permissions). */
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

const testFile = 'moodle-boost.html';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
);

function serveTest(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
      const pathname = url.pathname;

      if (pathname.includes('pluginfile.php')) {
        const cookie = req.headers.cookie || '';
        if (!cookie.includes('moodletest=1')) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('forbidden');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        res.end(TINY_PNG);
        return;
      }

      const base = path.basename(pathname);
      const file = path.join(root, 'test', !base || base === '/' ? testFile : base);
      const testDir = path.join(root, 'test');
      if (!file.startsWith(testDir) || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const headers = { 'Content-Type': 'text/html; charset=utf-8' };
      if (base === 'protected-image.html') {
        headers['Set-Cookie'] = 'moodletest=1; Path=/; SameSite=Lax';
      }
      res.writeHead(200, headers);
      res.end(fs.readFileSync(file));
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

const PORT = 4201;
const server = await serveTest(PORT);
const testUrl = `http://127.0.0.1:${PORT}/${testFile}`;

const browser = await puppeteer.launch({
  headless: false,
  protocolTimeout: 300000,
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-sandbox'],
});

const page = await browser.newPage();
await page.goto(testUrl, { waitUntil: 'networkidle0' });

const swTarget = await browser.waitForTarget(
  (t) => t.type() === 'service_worker' && t.url().includes('background/service-worker.js'),
  { timeout: 15000 }
);
const extensionId = new URL(swTarget.url()).host;

await page.bringToFront();
const harness = await browser.newPage();
await harness.goto(`chrome-extension://${extensionId}/popup/popup.html`);
const result = await harness.evaluate(async (url) => {
  const [tab] = await chrome.tabs.query({ url: `${url}*` });
  if (!tab?.id) throw new Error('Test tab not found');
  return chrome.runtime.sendMessage({
    type: 'FULLPAGE_CAPTURE',
    kind: 'image',
    options: { tabId: tab.id, expandLazy: false, overlapPx: 160 },
  });
}, `http://127.0.0.1:${PORT}/`);

if (!result?.ok) {
  console.error('Capture failed:', result?.error);
  await browser.close();
  server.close();
  restoreManifest();
  process.exit(1);
}

const meta = await harness.evaluate((id) =>
  chrome.runtime.sendMessage({ type: 'FULLPAGE_GET_CAPTURE', id })
, result.id);

const scrollLog = meta.record?.scrollLog || [];
const distinctY = new Set(scrollLog.map((s) => s.actualY));
if (scrollLog.length < 2 || distinctY.size < 2) {
  console.error('FAIL: expected distinct scroll positions', scrollLog);
  await browser.close();
  server.close();
  process.exit(1);
}
if (!meta.record?.pageText?.includes('Question')) {
  console.error('FAIL: pageText missing Question', meta.record?.pageText?.slice(0, 200));
  process.exit(1);
}

const viewerTarget = await browser.waitForTarget(
  (t) => t.type() === 'page' && t.url().includes('viewer/viewer.html'),
  { timeout: 180000 }
);
const viewerPage = await viewerTarget.page();
await viewerPage.waitForFunction(
  () => document.querySelector('.preview-root iframe.html-snapshot')?.srcdoc?.includes('Question'),
  { timeout: 60000 }
);

await viewerPage.click('#btn-view-screenshot');
await viewerPage.waitForFunction(
  () => document.querySelector('.preview-root img')?.naturalHeight > 400,
  { timeout: 60000 }
);

const layerStyle = await viewerPage.evaluate(() => {
  const span = document.querySelector('.text-layer span');
  if (!span) return { ok: false, reason: 'no text-layer span' };
  const cs = getComputedStyle(span);
  const transparent =
    cs.color === 'rgba(0, 0, 0, 0)' ||
    cs.color === 'transparent' ||
    cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)' ||
    cs.webkitTextFillColor === 'transparent';
  const bgClear =
    cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent';
  return { ok: transparent && bgClear, color: cs.color, fill: cs.webkitTextFillColor, bg: cs.backgroundColor };
});
if (!layerStyle.ok) {
  console.error('FAIL: text layer must be invisible by default', layerStyle);
  process.exit(1);
}

const imgHeight = await viewerPage.evaluate(
  () => document.querySelector('.preview-root img')?.naturalHeight || 0
);
if (imgHeight < 800) {
  console.error('FAIL: stitched image too short', imgHeight);
  process.exit(1);
}

await viewerPage.click('#btn-download-png');
const downloadWorked = await viewerPage.evaluate(() => {
  const rec = globalThis.__fullpageViewer?.getCurrentRecord();
  return Boolean(rec?.pngDataUrl?.startsWith('data:image/png'));
});
if (!downloadWorked) {
  console.error('FAIL: download hook / record missing PNG');
  process.exit(1);
}

await viewerPage.click('#btn-search');
await viewerPage.type('#search-input', 'Question');
const hits = await viewerPage.evaluate(() => document.querySelectorAll('.text-layer .search-hit').length);
if (hits < 1) {
  console.error('FAIL: search should highlight Question spans', hits);
  process.exit(1);
}

await viewerPage.click('#btn-edit');
await viewerPage.waitForSelector('#edit-bar:not([hidden])');
await viewerPage.click('#tool-pen');
await viewerPage.click('#btn-cancel-edit');

await page.goto(`http://127.0.0.1:${PORT}/protected-image.html`, { waitUntil: 'networkidle0' });
const prot = await harness.evaluate(async (origin) => {
  const [tab] = await chrome.tabs.query({ url: `${origin}*` });
  if (!tab?.id) throw new Error('Protected test tab not found');
  return chrome.runtime.sendMessage({
    type: 'FULLPAGE_CAPTURE',
    kind: 'reconstruct',
    options: { tabId: tab.id },
  });
}, `http://127.0.0.1:${PORT}/`);

if (!prot?.ok) {
  console.error('FAIL: protected reconstruct capture', prot?.error);
  process.exit(1);
}

const protMeta = await harness.evaluate((id) =>
  chrome.runtime.sendMessage({ type: 'FULLPAGE_GET_CAPTURE', id })
, prot.id);

const html = protMeta.record?.html || '';
if (!/data:image\/[a-z+]+;base64,/i.test(html)) {
  console.error('FAIL: saved HTML should inline auth-protected image as data URI', html.slice(0, 400));
  process.exit(1);
}

console.log(
  'OK moodle-boost e2e — slices:',
  scrollLog.length,
  'distinct Y:',
  distinctY.size,
  'img height:',
  imgHeight,
  'protected data-uri: yes'
);

await browser.close();
server.close();
restoreManifest();
process.exit(0);
