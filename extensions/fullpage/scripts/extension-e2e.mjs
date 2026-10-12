/**
 * Puppeteer E2E: unpacked extension, Moodle Boost fixture, distinct scroll slices, viewer downloads.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const testFile = 'moodle-boost.html';

function serveTest(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const base = path.basename((req.url || '/').split('?')[0]);
      const file = path.join(root, 'test', base === '/' ? testFile : base);
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
  () => document.querySelector('.preview-root img')?.naturalHeight > 400,
  { timeout: 60000 }
);

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

console.log(
  'OK moodle-boost e2e — slices:',
  scrollLog.length,
  'distinct Y:',
  distinctY.size,
  'img height:',
  imgHeight
);

await browser.close();
server.close();
process.exit(0);
