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
