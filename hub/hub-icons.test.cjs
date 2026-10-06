'use strict';
// Hub (suite launcher) icons are the Neill Data suite logo (ND), not a suite tile icon, so the
// hub is not in scripts/render-app-icons.cjs. This keeps the same guarantees for it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { decode, inspect } = require('../scripts/render-app-icons.cjs');
const HUB = __dirname;
const read = (f) => fs.readFileSync(path.join(HUB, f));

test('hub apple-touch-icon and maskables are opaque RGB at the right sizes', () => {
  for (const [file, size] of [['icons/icon-180.png', 180], ['icons/maskable-192.png', 192], ['icons/maskable-512.png', 512]]) {
    assert.deepEqual(inspect(read(file), size), [], file);
  }
  for (const [file, size] of [['icons/icon-192.png', 192], ['icons/icon-512.png', 512]]) {
    const d = decode(read(file));
    assert.equal(d.w, size, file); assert.equal(d.h, size, file);
  }
});

test('hub page, manifest and service worker reference the ND icons', () => {
  const html = read('index.html').toString();
  assert.match(html, /<link rel="icon" href="favicon\.svg\?v=[\d.]+" type="image\/svg\+xml">/);
  assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="icons\/icon-180\.png"/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="Hub"/);
  const m = JSON.parse(read('manifest.json'));
  const got = m.icons.map((i) => i.purpose + ' ' + i.sizes).sort();
  assert.deepEqual(got, ['any 192x192', 'any 512x512', 'maskable 192x192', 'maskable 512x512']);
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(HUB, i.src)), i.src);
  const sw = read('sw.js').toString();
  for (const f of ['icon-180', 'icon-192', 'icon-512', 'maskable-192', 'maskable-512']) assert.match(sw, new RegExp('"\\./icons/' + f + '\\.png"'), f);
  const fav = html.match(/favicon\.svg\?v=([\d.]+)/)[1];
  assert.match(sw, new RegExp('"\\./favicon\\.svg\\?v=' + fav.replace(/\./g, '\\.') + '"'), 'sw precaches the same favicon ?v=');
  assert.doesNotMatch(read('favicon.svg').toString(), /<text\b|font-family|href=/, 'favicon is outlined paths, no fonts or external refs');
});
