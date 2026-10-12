/* Gate Codes proximity + access policy tests (pure helpers from GateCodes.gs). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({
  console, JSON, Math, Object, String, Number, Array, Date, parseFloat, parseInt, isFinite,
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
  SpreadsheetApp: {}, UrlFetchApp: {}, privateTab_: () => ({}), pepper_: () => 'pep',
  credFromCode_: () => 'v2$x', sha256Hex_: () => 'abc', credMatch_: () => '', getSession_: () => null,
  newSession_: () => 'tok', settleLogin_: () => null, plainCell_: (v) => v, str_: (v) => v,
  randomHex_: () => 'abcd', truthy_: (v) => v === true
});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'GateCodes.gs'), 'utf8'), ctx, { filename: 'GateCodes.gs' });

const sites = [
  { site_id: 'a', site_name: 'Alpha', lat: -37.8136, lng: 144.9631, code: '1111' },
  { site_id: 'b', site_name: 'Beta', lat: -37.8150, lng: 144.9650, code: '2222' }
];

test('inside 150m returns nearest site', () => {
  const hit = ctx.gcNearestSiteWithin_(sites, -37.8137, 144.9632, 150);
  assert.equal(hit.site.site_id, 'a');
});

test('outside 150m returns null', () => {
  assert.equal(ctx.gcNearestSiteWithin_(sites, -38.0, 145.0, 150), null);
});

test('nearest wins when two in range', () => {
  const hit = ctx.gcNearestSiteWithin_(sites, -37.8140, 144.9640, 150);
  assert.equal(hit.site.site_id, 'a');
});

test('anonymous policy returns at most one site', () => {
  const res = ctx.gcListPolicy_(false, sites, -37.8137, 144.9632, 150);
  assert.equal(res.mode, 'proximity');
  assert.ok(res.site);
  assert.equal(Array.isArray(res.codes), false);
});

test('editor policy returns full list', () => {
  const res = ctx.gcListPolicy_(true, sites, 0, 0, 150);
  assert.equal(res.mode, 'full');
  assert.equal(res.codes.length, 2);
});

test('validate code is exactly four digits', () => {
  assert.equal(ctx.gcValidateCode_('1234'), '');
  assert.match(ctx.gcValidateCode_('123'), /4 digits/);
  assert.match(ctx.gcValidateCode_('12345'), /4 digits/);
});
