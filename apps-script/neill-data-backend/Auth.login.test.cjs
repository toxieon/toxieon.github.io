/* node --test apps-script/neill-data-backend/Auth.login.test.cjs
 * Login lockout is decided while the script lock is held, and sheet text
 * that starts with = + - @ is stored as text. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const cacheMap = new Map();
const propMap = new Map();
let lockHeld = false;
const cache = {
  get(k) { return cacheMap.has(k) ? cacheMap.get(k) : null; },
  put(k, v) { cacheMap.set(k, String(v)); },
  remove(k) { cacheMap.delete(k); },
  removeAll(keys) { keys.forEach(k => cacheMap.delete(k)); }
};
const properties = {
  getProperty(k) { return propMap.has(k) ? propMap.get(k) : null; },
  setProperty(k, v) { propMap.set(k, String(v)); },
  deleteProperty(k) { propMap.delete(k); },
  getProperties() { return Object.fromEntries(propMap); }
};
const lock = {
  tryLock() { if (lockHeld) return false; lockHeld = true; return true; },
  releaseLock() { lockHeld = false; }
};
const ctx = vm.createContext({
  console, JSON, Math, Object, String, Number, Array, Date, RegExp,
  PropertiesService: { getScriptProperties: () => properties },
  LockService: { getScriptLock: () => lock },
  CacheService: { getScriptCache: () => cache },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    getUuid: () => crypto.randomUUID(),
    computeDigest: (_, s) => Array.from(crypto.createHash('sha256').update(String(s)).digest()),
    computeHmacSha256Signature: (s, k) => Array.from(crypto.createHmac('sha256', String(k)).update(String(s)).digest())
  }
});
const dir = __dirname;
for (const f of ['Config.gs', 'Auth.gs', 'Quote.gs']) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
}

assert.equal(ctx.plainCell_('=IMPORTRANGE("evil","Users!A1")'), "'=IMPORTRANGE(\"evil\",\"Users!A1\")");
assert.equal(ctx.plainCell_('+cmd'), "'+cmd");
assert.equal(ctx.plainCell_('-1'), "'-1");
assert.equal(ctx.plainCell_('@sum'), "'@sum");
assert.equal(ctx.plainCell_('Neill'), 'Neill');
assert.equal(ctx.plainCell_('v2$abc'), 'v2$abc');
assert.equal(ctx.plainCell_(12), 12);
assert.equal(ctx.plainCell_(''), '');

assert.match(ctx.validCode_('1234'), /6 characters/);
assert.match(ctx.validCode_('aaaaaa'), /easy to guess/);
assert.match(ctx.validCode_('123456'), /easy to guess/);
assert.equal(ctx.validCode_('blue-horse'), '');

// Nine wrong codes, then a correct one, still allowed. The tenth wrong code
// closes the gate, and a correct code after that is rejected without a session.
for (let i = 0; i < 9; i++) assert.equal(ctx.settleLogin_('q', '', 'fail').error, 'invalid passcode');
assert.equal(ctx.settleLogin_('q', 'sam', 'ok'), null);
assert.equal(ctx.settleLogin_('q', '', 'fail').error, 'invalid passcode');
const closed = ctx.settleLogin_('q', 'sam', 'ok');
assert.ok(closed && closed.cooldownMs > 0);
assert.equal(closed.locked, undefined);
assert.equal(closed.error.includes('invalid passcode'), false);

// A correct code for a locked account is still reported as locked while the
// gate is open. Use a fresh scope so the counter above does not apply.
cacheMap.clear(); propMap.clear();
assert.equal(ctx.settleLogin_('other', 'sam', 'locked').locked, true);

// Per-user cap (5) stops one name without using up the global cap (10).
cacheMap.clear(); propMap.clear();
for (let i = 0; i < 5; i++) ctx.settleLogin_('q2', 'sam', 'fail');
const samBlocked = ctx.settleLogin_('q2', 'sam', 'ok');
assert.ok(samBlocked && samBlocked.cooldownMs > 0);
assert.equal(ctx.settleLogin_('q2', 'alex', 'ok'), null);

// If the lock is already held, the attempt fails closed and does not count.
cacheMap.clear(); propMap.clear();
lockHeld = true;
const busy = ctx.settleLogin_('q3', '', 'ok');
assert.equal(busy.ok, false);
assert.ok(busy.cooldownMs > 0);
lock.releaseLock();
assert.equal(ctx.settleLogin_('q3', '', 'ok'), null);

const q = { status: 'complete', completed: true, completedAt: 'x', grand: 10 };
ctx.freezeStaffStatus_(q, { status: 'in_progress', completed: false, inProgressAt: 't' });
assert.equal(q.status, 'in_progress');
assert.equal(q.completed, false);
assert.equal(q.completedAt, undefined);
assert.equal(q.inProgressAt, 't');
assert.equal(q.grand, 10);
ctx.freezeStaffStatus_(q, null);
assert.equal(q.status, 'quote');

console.log('Quote login lockout tests passed');
