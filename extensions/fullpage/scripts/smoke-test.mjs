/**
 * Headless smoke test: load test page, inject page-tools, verify metrics & reconstruct.
 * Run: node extensions/fullpage/scripts/smoke-test.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(root, '..', 'test');
const toolsPath = path.join(root, '..', 'content', 'page-tools.js');

const pages = ['long-page.html', 'inner-scroll.html', 'pagination.html'];

const browser = await chromium.launch();
const context = await browser.newContext();
let failed = 0;

for (const name of pages) {
  const page = await context.newPage();
  const url = 'file://' + path.join(testDir, name);
  await page.goto(url);
  await page.addScriptTag({ path: toolsPath });
  const metrics = await page.evaluate(() => globalThis.__NeillFullPageTools.getPageMetrics());
  if (!metrics.height || metrics.height < 400) {
    console.error('FAIL', name, 'height', metrics.height);
    failed++;
  } else {
    console.log('OK metrics', name, metrics.height, 'x', metrics.width);
  }
  if (name === 'long-page.html') {
    const html = await page.evaluate(() => globalThis.__NeillFullPageTools.reconstructHtml({ inlineImages: false }));
    if (!html.includes('Sticky site header') || html.includes('<script')) {
      console.error('FAIL reconstruct', name);
      failed++;
    } else {
      console.log('OK reconstruct', name, 'bytes', html.length);
    }
  }
  await page.close();
}

await browser.close();
process.exit(failed ? 1 : 0);
