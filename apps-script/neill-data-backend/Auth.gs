/* Credentials, sessions and rate limits — all server-side.
 *
 * Stored credential (Users.PasswordHash, TimesheetLive.CodeHash):
 *     'v2$' + HMAC-SHA256(key = ND_PEPPER, msg = sha256hex(code))
 * The pepper lives only in Script Properties, so nothing readable from a sheet
 * can be replayed: the login endpoints take the CODE (never a hash) and hash it
 * here. Legacy Quote rows hold plain sha256hex(code); a successful login
 * re-writes them as v2 (and migrateAllUsers() can convert the rest in bulk,
 * because v2 is computed from the legacy sha256 value — no plaintext needed).
 */

function pepper_() { return PropertiesService.getScriptProperties().getProperty(PROP.pepper) || ''; }
function ensurePepper_() {
  const props = PropertiesService.getScriptProperties();
  let p = props.getProperty(PROP.pepper);
  if (!p) { p = randomHex_(64); props.setProperty(PROP.pepper, p); }
  return p;
}
function credFromLegacy_(legacyHex, pepper) { return 'v2$' + hmacHex_(String(legacyHex).toLowerCase(), pepper); }
function credFromCode_(code, pepper) { return credFromLegacy_(sha256Hex_(String(code)), pepper); }
function isLegacyHash_(s) { return /^[0-9a-f]{64}$/i.test(String(s || '').trim()); }
/** Does stored value `stored` match? Returns 'v2' | 'legacy' | ''. */
function credMatch_(stored, legacyHex, v2) {
  stored = String(stored == null ? '' : stored).trim();
  if (!stored) return '';
  if (stored.indexOf('v2$') === 0) return safeEq_(stored.toLowerCase(), v2.toLowerCase()) ? 'v2' : '';
  if (isLegacyHash_(stored)) return safeEq_(stored.toLowerCase(), legacyHex) ? 'legacy' : '';
  return '';
}
function safeEq_(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/* ───────────────────────────── sessions ───────────────────────────── */
// Script Properties (not CacheService: Cache caps at 6 h and Quote stays
// unlocked for the working day). Key = hash of the token, so the property
// list never contains a usable token.

const SESS_PREFIX = 'sess_';
function sessKey_(token) { return SESS_PREFIX + sha256Hex_('sess:' + token).slice(0, 40); }
function newSession_(kind, subject, ttlMs) {
  purgeExpiredSessions_();
  const token = randomHex_(64);
  PropertiesService.getScriptProperties().setProperty(sessKey_(token),
    JSON.stringify({ k: kind, u: subject, exp: Date.now() + ttlMs }));
  return token;
}
function getSession_(kind, token) {
  token = String(token || '');
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const props = PropertiesService.getScriptProperties();
  const key = sessKey_(token);
  let s = null;
  try { s = JSON.parse(props.getProperty(key) || 'null'); } catch (e) { s = null; }
  if (!s || s.k !== kind) return null;
  if (s.exp < Date.now()) { props.deleteProperty(key); return null; }
  s.key = key;
  return s;
}
function dropSession_(token) {
  if (/^[0-9a-f]{64}$/.test(String(token || ''))) PropertiesService.getScriptProperties().deleteProperty(sessKey_(token));
}
/** Revoke every session of `kind` for `subject` (case-insensitive), except `keepKey`. */
function dropSessionsFor_(kind, subject, keepKey) {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const want = String(subject || '').toLowerCase();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(SESS_PREFIX) !== 0 || k === keepKey) return;
    try { const s = JSON.parse(all[k]); if (s.k === kind && String(s.u).toLowerCase() === want) props.deleteProperty(k); } catch (e) {}
  });
}
function renameSessions_(kind, from, to) {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(SESS_PREFIX) !== 0) return;
    try {
      const s = JSON.parse(all[k]);
      if (s.k === kind && String(s.u).toLowerCase() === String(from).toLowerCase()) { s.u = to; props.setProperty(k, JSON.stringify(s)); }
    } catch (e) {}
  });
}
function purgeExpiredSessions_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(SESS_PREFIX) !== 0) return;
    try { if (JSON.parse(all[k]).exp < now) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

/* ─────────────────────────── rate limiting ─────────────────────────── */
// Keyed on things the server controls — never a browser-made device ID:
//   global per app (15-min window in CacheService + 24-h cap in Script Properties)
//   per named user (when the login names a user — see REQUIRE_USERNAME)

function rlUserKey_(scope, user) { return 'rl_' + scope + '_u_' + sha256Hex_(String(user).toLowerCase()).slice(0, 24); }
function readWin_(raw, now, winMs) {
  try { const c = JSON.parse(raw || 'null'); if (c && now - c.first < winMs) return c; } catch (e) {}
  return { n: 0, first: now };
}
function counters_(scope, user, now) {
  const cache = CacheService.getScriptCache();
  const props = PropertiesService.getScriptProperties();
  return {
    g: readWin_(cache.get('rl_' + scope + '_g'), now, FAIL_WINDOW_MS),
    d: readWin_(props.getProperty('rl_' + scope + '_day'), now, 24 * 3600 * 1000),
    u: user ? readWin_(cache.get(rlUserKey_(scope, user)), now, FAIL_WINDOW_MS) : null
  };
}
/** null if allowed, else the response to send ({error, cooldownMs}). */
function loginGate_(scope, user) {
  const now = Date.now();
  const c = counters_(scope, user, now);
  let until = 0;
  if (c.g.n >= MAX_FAILS_GLOBAL) until = Math.max(until, c.g.first + FAIL_WINDOW_MS);
  if (c.d.n >= MAX_FAILS_GLOBAL_DAY) until = Math.max(until, c.d.first + 24 * 3600 * 1000);
  if (c.u && c.u.n >= MAX_FAILS_PER_USER) until = Math.max(until, c.u.first + FAIL_WINDOW_MS);
  if (!until) return null;
  const ms = Math.max(1000, until - now);
  return { ok: false, error: 'too many failed attempts — try again in ' + Math.ceil(ms / 1000) + ' seconds', cooldownMs: ms };
}
/** Count a failure; returns attempts left before the tightest limit trips (<= 0 → locked out). */
function loginFail_(scope, user) {
  const lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    const now = Date.now();
    const c = counters_(scope, user, now);
    const cache = CacheService.getScriptCache();
    c.g.n++; c.d.n++;
    cache.put('rl_' + scope + '_g', JSON.stringify(c.g), Math.ceil(FAIL_WINDOW_MS / 1000));
    PropertiesService.getScriptProperties().setProperty('rl_' + scope + '_day', JSON.stringify(c.d));
    let left = Math.min(MAX_FAILS_GLOBAL - c.g.n, MAX_FAILS_GLOBAL_DAY - c.d.n);
    if (c.u) { c.u.n++; cache.put(rlUserKey_(scope, user), JSON.stringify(c.u), Math.ceil(FAIL_WINDOW_MS / 1000)); left = Math.min(left, MAX_FAILS_PER_USER - c.u.n); }
    return left;
  } finally { try { lock.releaseLock(); } catch (e) {} }
}
function loginOk_(scope, user) {
  if (user) CacheService.getScriptCache().remove(rlUserKey_(scope, user));
}
function failResponse_(left, scope, user) {
  const res = { ok: false, error: 'invalid passcode' };
  if (left <= 0) { const g = loginGate_(scope, user); res.cooldownMs = g ? g.cooldownMs : FAIL_WINDOW_MS; }
  else res.attemptsRemaining = left;
  return res;
}

/* ───────────────────────────── utils ───────────────────────────── */

function bytesToHex_(bytes) { return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function sha256Hex_(str) { return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(str), Utilities.Charset.UTF_8)); }
function hmacHex_(value, key) { return bytesToHex_(Utilities.computeHmacSha256Signature(String(value), String(key))); }
function randomHex_(n) {
  let s = '';
  while (s.length < n) s += sha256Hex_(Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random());
  return s.slice(0, n);
}
function truthy_(v) { return v === true || /^(true|yes|y|1)$/i.test(String(v == null ? '' : v).trim()); }
function str_(v, n) { return String(v == null ? '' : v).slice(0, n || 500); }
function normKey_(s) { return String(s || '').toLowerCase().replace(/[\s_]/g, ''); }
function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }
function iso_(v) { return isDate_(v) ? v.toISOString() : String(v == null ? '' : v); }
