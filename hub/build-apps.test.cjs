'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const gen = require('./build-apps.cjs');

test('committed hub/apps.json matches the generator (run: node hub/build-apps.cjs)', () => {
  assert.equal(fs.readFileSync(path.join(__dirname, 'apps.json'), 'utf8'), gen.build());
});

test('hub keeps its pre-discovery tiles in the same order, plus ICO Generator', () => {
  const visible = JSON.parse(gen.build()).apps.filter(a => !a.hidden).map(a => a.id);
  assert.deepEqual(visible, ['planner', 'upload', 'search', 'quote', 'timesheet', 'swb', 'fitoff', 'assets', 'company', 'ico']);
  const ico = JSON.parse(gen.build()).apps.find(a => a.id === 'ico');
  assert.equal(ico.name, 'ICO Generator');
  assert.equal(ico.version, fs.readFileSync(path.join(__dirname, '../ico/VERSION'), 'utf8').trim());
});

test('parsePage reads title, favicon and nd:* meta in any attribute order / quoting', () => {
  const p = gen.parsePage(`<head><title>ND &bull; Thing &amp; Co</title><!-- <meta name="nd:app" content="no"> -->
    <link href="favicon.svg" rel="icon"><meta content='#AABBCC' name='nd:color'><meta name="ND:Order" content="3"></head><body><meta name="nd:app" content="body"></body>`);
  assert.equal(p.title, 'ND • Thing & Co');
  assert.equal(gen.cleanTitle(p.title), 'Thing & Co');
  assert.equal(p.favicon, 'favicon.svg');
  assert.deepEqual(p.meta, { 'nd:color': '#AABBCC', 'nd:order': '3' });
  assert.equal(gen.cleanTitle('Assets · Neill Data Suite'), 'Assets');
  assert.equal(gen.resolveHref('../assets/x.svg?v=1', 'foo'), '/assets/x.svg?v=1');
  assert.equal(gen.resolveHref('icons/a.png', 'foo'), '/foo/icons/a.png');
});

function site(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-hub-'));
  for (const [f, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), body);
  }
  return root;
}

test('discovery: defaults, exclude list, meta tags, overrides and app.json precedence', () => {
  const root = site({
    'hub/discover.json': JSON.stringify({ exclude: ['skipme'], overrides: { legacy: { name: 'Legacy', color: '#111111', order: 1 }, both: { color: '#222222', order: 2 } } }),
    'newtool/index.html': '<title>ND • New Tool</title>',
    'newtool/VERSION': '0.2.1\n',
    'meta/index.html': '<head><title>x</title><link rel="icon" href="img/i.png"><meta name="nd:app" content="Meta App"><meta name="nd:id" content="meta-app"><meta name="nd:color" content="#123456"><meta name="nd:order" content="5"></head>',
    'legacy/index.html': '<title>Old</title>',
    'legacy/favicon.svg': '<svg/>',
    'both/index.html': '<meta name="nd:color" content="#333333"><title>Both</title>',
    'both/app.json': '{"order": 4, "hidden": true}',
    'secret/index.html': '<meta name="nd:hidden" content="true"><title>Secret</title>',
    'skipme/index.html': '<title>Skip</title>',
    'assets/x.js': '',
    '.git/index.html': '',
  });
  const apps = gen.discover(root);
  const by = Object.fromEntries(apps.map(a => [a.id, a]));
  assert.deepEqual(Object.keys(by).sort(), ['both', 'legacy', 'meta-app', 'newtool', 'secret']);
  assert.deepEqual(by.newtool, { id: 'newtool', name: 'New Tool', path: '/newtool/', icon: '', color: '#94a3b8', order: 99, hidden: false, version: '0.2.1' });
  assert.deepEqual(by['meta-app'], { id: 'meta-app', name: 'Meta App', path: '/meta/', icon: '/meta/img/i.png', color: '#123456', order: 5, hidden: false });
  assert.equal(by.legacy.icon, '/legacy/favicon.svg');
  assert.equal(by.legacy.name, 'Legacy');
  assert.equal(by.both.color, '#333333');   // meta beats override
  assert.equal(by.both.order, 4);           // app.json beats override
  assert.equal(by.both.hidden, true);
  assert.equal(by.secret.hidden, true);
  assert.deepEqual(apps.map(a => a.id), ['legacy', 'both', 'meta-app', 'newtool', 'secret']);
});

test('discovery: suite icon fallback and invalid values fail loudly', () => {
  const root = site({
    'hub/discover.json': '{}',
    'assets/suite-icons/catalog.json': JSON.stringify({ icons: [{ id: 'app-tool', kind: 'app', color: '#abcdef', file: 'assets/suite-icons/apps/tool.svg' }] }),
    'tool/index.html': '<title>Tool</title>',
  });
  const [tool] = gen.discover(root);
  assert.equal(tool.icon, '/assets/suite-icons/apps/tool.svg');
  assert.equal(tool.color, '#abcdef');
  fs.writeFileSync(path.join(root, 'tool/index.html'), '<meta name="nd:color" content="blue"><title>Tool</title>');
  assert.throws(() => gen.discover(root), /color "blue"/);
  fs.writeFileSync(path.join(root, 'tool/index.html'), '<meta name="nd:id" content="Bad Id"><title>Tool</title>');
  assert.throws(() => gen.discover(root), /id "Bad Id"/);
});
