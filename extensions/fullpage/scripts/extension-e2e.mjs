/**
 * Loads the unpacked extension in Puppeteer and runs an image capture on a long inner-scroll page.
 * Requires: npx puppeteer (uses bundled Chromium with extension support; headless: false).
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const testFile = path.join(root, 'test', 'inner-scroll-lms.html');

function serveFile(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url === '/' ? '/inner-scroll-lms.html' : req.url;
      const base = path.basename(url.split('?')[0]);
      const file = path.join(root, 'test', base);
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

const PORT = 4199;
const server = await serveFile(PORT);
const testUrl = `http://127.0.0.1:${PORT}/inner-scroll-lms.html`;

const browser = await puppeteer.launch({
  headless: false,
  args: [
    `--disable-extensions-except=${root}`,
    `--load-extension=${root}`,
    '--no-sandbox',
    '--disable-setuid-sandbox',
  ],
});

const page = await browser.newPage();
await page.goto(testUrl, { waitUntil: 'networkidle0' });

const swTarget = await browser.waitForTarget(
  (t) => t.type() === 'service_worker' && t.url().includes('background/service-worker.js'),
  { timeout: 15000 }
);
const extensionId = new URL(swTarget.url()).host;

const tabs = await browser.pages();
const testPage = tabs.find((p) => p.url().includes('127.0.0.1')) || page;
await testPage.bringToFront();

const harness = await browser.newPage();
await harness.goto(`chrome-extension://${extensionId}/popup/popup.html`);

const result = await harness.evaluate(async (url) => {
  const candidates = await chrome.tabs.query({ url: `${url}*` });
  const tab = candidates[0];
  if (!tab?.id) throw new Error('Test tab not found');
  return chrome.runtime.sendMessage({
    type: 'FULLPAGE_CAPTURE',
    kind: 'image',
    options: { tabId: tab.id },
  });
}, `http://127.0.0.1:${PORT}/`);

if (!result?.ok) {
  console.error('Capture failed:', result?.error);
  await browser.close();
  server.close();
  process.exit(1);
}

const viewerTarget = await browser.waitForTarget(
  (t) => t.type() === 'page' && t.url().includes('viewer/viewer.html'),
  { timeout: 120000 }
);
const viewerPage = await viewerTarget.page();
await viewerPage.waitForFunction(
  () => document.querySelector('.preview-root img')?.naturalWidth > 0,
  { timeout: 30000 }
).catch(() => null);
const hasImage = await viewerPage.evaluate(() => {
  const img = document.querySelector('.preview-root img');
  return Boolean(img && img.src && img.src.startsWith('data:'));
});
console.log('OK extension e2e — viewer image:', hasImage, 'capture id:', result.id);

await browser.close();
server.close();
process.exit(hasImage ? 0 : 1);
