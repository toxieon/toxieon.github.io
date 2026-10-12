const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('gcList_ source requires editor auth (not view PIN)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../apps-script/neill-data-backend/GateCodes.gs'), 'utf8');
  const fn = src.match(/function gcList_\([^)]*\)\s*\{[\s\S]*?\n\}/);
  assert.ok(fn);
  assert.match(fn[0], /gcAuthEditor_/);
  assert.doesNotMatch(fn[0], /viewSession/);
});

test('gcNearby_ returns a single site field', () => {
  const src = fs.readFileSync(path.join(__dirname, '../apps-script/neill-data-backend/GateCodes.gs'), 'utf8');
  const fn = src.match(/function gcNearby_\([^)]*\)\s*\{[\s\S]*?\n\}/);
  assert.ok(fn);
  assert.match(fn[0], /site: hit \? gcPublicSite_/);
  assert.doesNotMatch(fn[0], /\bcodes\b/);
});

test('private app is kept out of hub discovery, the visual catalogue and public listings', () => {
  const root = path.join(__dirname, '..');
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, '.nd-private')));
  assert.ok(dirs.length >= 1, 'gate codes folder carries the .nd-private marker');
  const { discover } = require('../hub/build-apps.cjs');
  const apps = discover(root);
  const cat = fs.readFileSync(path.join(root, '1234567890/visual-catalog.json'), 'utf8');
  const pub = ['hub/apps.json', 'hub/discover.json', 'robots.txt', 'sitemap.xml', 'hub/app.js', 'hub/index.html', 'assets/suite-icons.js', 'scripts/render-app-icons.cjs']
    .map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  for (const d of dirs) {
    assert.ok(!apps.some((a) => a.path === '/' + d.name + '/'), 'not discovered');
    assert.ok(!cat.includes(d.name), 'not in visual catalogue');
    assert.ok(!pub.includes(d.name), 'slug not in public listing files');
    const html = fs.readFileSync(path.join(root, d.name, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /name="nd:/i, 'no nd:* meta (nd:color etc.)');
    assert.match(html, /noindex/);
  }
});

test('editor list is never written to storage by the client', () => {
  const src = fs.readFileSync(path.join(__dirname, 'nd-gate-codes.js'), 'utf8');
  assert.doesNotMatch(src, /setItem\([^)]*codes/);
  assert.doesNotMatch(src, /gc_editor_list_v1"\s*,/);
});
