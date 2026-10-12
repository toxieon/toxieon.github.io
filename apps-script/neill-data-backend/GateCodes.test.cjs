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

/* ── security behaviour (0.1.2 hardening) ─────────────────────────── */
const crypto = require('node:crypto');
function secCtx(opts) {
  opts = opts || {};
  const props = Object.assign({ GC_PIN_ENABLED: 'true' }, opts.props || {});
  const fetches = [];
  const c = vm.createContext({
    console, JSON, Math, Object, String, Number, Array, Date, parseFloat, parseInt, isFinite,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    UrlFetchApp: { fetch: (url, o) => { fetches.push({ url, o }); return opts.tokeninfo(o.payload); } },
    SpreadsheetApp: {}, plainCell_: (v) => v, str_: (v) => v, truthy_: (v) => v === true || v === 'true',
    pepper_: () => 'pepper', hmacHex_: (v, k) => crypto.createHmac('sha256', String(k)).update(String(v)).digest('hex'),
    randomHex_: (n) => crypto.randomBytes(n).toString('hex').slice(0, n),
    safeEq_: (a, b) => String(a) === String(b),
    getSession_: () => null, newSession_: () => 'view-tok',
    settleLogin_: (scope, user, outcome) => (outcome === 'ok' ? null : { ok: false, error: 'invalid passcode' }),
    privateTab_: () => ({ getDataRange: () => ({ getValues: () => opts.editorRows || [['email', 'role']] }) })
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'GateCodes.gs'), 'utf8'), c, { filename: 'GateCodes.gs' });
  return { c, props, fetches };
}
const CID = '418369916603-u3pqd7ngq7nuvd032dagjc5apq8ogg2e.apps.googleusercontent.com';
const now = () => Math.floor(Date.now() / 1000);
const okResp = (obj) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(obj) });
const badResp = { getResponseCode: () => 400, getContentText: () => '{}' };

test('ID token: aud, iss, exp and email_verified are all enforced', () => {
  const good = { aud: CID, iss: 'https://accounts.google.com', exp: String(now() + 600), email: 'Brandon.J.Neill@gmail.com', email_verified: 'true', sub: '1' };
  const check = (p, kind) => vm.runInContext('gcCheckTokenClaims_', secCtx({ tokeninfo: () => badResp }).c)(p, kind, CID, now());
  assert.equal(check(good, 'id').email, 'brandon.j.neill@gmail.com');
  assert.equal(check(Object.assign({}, good, { aud: 'other.apps.googleusercontent.com' }), 'id'), null);
  assert.equal(check(Object.assign({}, good, { iss: 'evil.example' }), 'id'), null);
  assert.equal(check(Object.assign({}, good, { exp: String(now() - 1) }), 'id'), null);
  assert.equal(check(Object.assign({}, good, { email_verified: 'false' }), 'id'), null);
  // Access tokens must also be minted for our client (aud/azp), and unexpired.
  assert.ok(check({ azp: CID, aud: CID, exp: String(now() + 60), email: 'a@b.co', email_verified: 'true' }, 'access'));
  assert.equal(check({ azp: 'x', aud: 'x', exp: String(now() + 60), email: 'a@b.co', email_verified: 'true' }, 'access'), null);
});

test('invalid/expired token is anonymous: gc_list and owner link refuse; token never in a URL', () => {
  const { c, fetches } = secCtx({ tokeninfo: () => badResp });
  assert.deepEqual(JSON.parse(JSON.stringify(c.gcList_({ accessToken: 'junk' }))), { ok: false, error: 'forbidden' });
  assert.equal(c.gcOwnerAppLink_({ idToken: 'junk' }).error, 'forbidden');
  assert.equal(c.gcList_({}).error, 'forbidden');
  fetches.forEach((f) => { assert.doesNotMatch(f.url, /junk/); assert.equal(f.o.method, 'post'); });
});

test('editor (non-owner) cannot manage editors, see the editor list, or get the owner link', () => {
  const tok = { azp: CID, aud: CID, exp: String(now() + 600), email: 'crew@example.com', email_verified: 'true' };
  const { c } = secCtx({ tokeninfo: () => okResp(tok), editorRows: [['email', 'role'], ['crew@example.com', 'editor']], props: { GC_APP_SLUG: 'g-secret-slug-123' } });
  assert.equal(c.gcList_({ accessToken: 't' }).ok, true);
  const meta = c.gcEditorsList_({ accessToken: 't' });
  assert.equal(meta.isEditor, true); assert.equal(meta.isOwner, false); assert.equal(meta.editors, undefined);
  assert.equal(c.gcEditorsAdd_({ accessToken: 't', email: 'x@y.co' }).error, 'forbidden');
  assert.equal(c.gcEditorsRemove_({ accessToken: 't', email: 'x@y.co' }).error, 'forbidden');
  assert.equal(c.gcPinSet_({ accessToken: 't', pin: '1234' }).error, 'forbidden');
  assert.equal(c.gcOwnerAppLink_({ accessToken: 't' }).error, 'forbidden');
});

test('owner link works only for the verified owner', () => {
  const tok = { azp: CID, aud: CID, exp: String(now() + 600), email: 'brandon.j.neill@gmail.com', email_verified: 'true' };
  const { c } = secCtx({ tokeninfo: () => okResp(tok), props: { GC_APP_SLUG: 'g-secret-slug-123' } });
  const r = c.gcOwnerAppLink_({ accessToken: 't' });
  assert.equal(r.ok, true); assert.equal(r.app.path, '/g-secret-slug-123/');
});

test('PIN is stored salted + hashed; verify gates nearby; wrong PIN fails', () => {
  const { c, props } = secCtx({ tokeninfo: () => badResp });
  c.PropertiesService.getScriptProperties().setProperty('GC_PIN_HASH', c.gcNewPinHash_('482916'));
  const a = props.GC_PIN_HASH;
  assert.match(a, /^gc1\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.doesNotMatch(a, /482916/);
  assert.notEqual(c.gcNewPinHash_('482916'), a, 'fresh salt each time');
  assert.equal(c.gcPinVerify_({ pin: '482916' }).ok, true);
  assert.equal(c.gcPinVerify_({ pin: '000000' }).ok, false);
  assert.equal(c.gcPinVerify_({ pin: 'abc' }).ok, false);
  assert.equal(c.gcNearby_({ lat: -37.8, lng: 144.9 }).error, 'pin_required');
});
