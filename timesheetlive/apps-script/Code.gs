/**
 * Timesheet Live — passcode-gated, read-only feed for https://www.neilldata.com/timesheetlive/
 *
 * A NEW, standalone Apps Script web app (Neill Quote's backend source isn't in
 * the repo, so it can't be extended). Same pattern as Quote: the page POSTs
 * JSON as text/plain, the passcode is checked HERE (server-side), failed
 * attempts are rate-limited per device + globally, and unlocks are logged.
 *
 *   Codes  → Neill Quote spreadsheet, tab "TimesheetLive"   (separate from Quote's Users tab)
 *   Log    → Neill Quote spreadsheet, tab "TimesheetLiveLog"
 *   Data   → private Timesheet-Data spreadsheet, tab "live_snapshot" (written by the
 *            signed-in Timesheet app; this script only READS it)
 *
 * Codes are stored as HMAC-SHA256(secret pepper, sha256(lowercase code)). The
 * pepper lives in Script Properties, never in the sheet or the page, because
 * the Quote spreadsheet is link-viewable (Quote reads prices via gviz) — so a
 * plain hash of "1111" in that sheet would be readable and instantly reversible.
 *
 * DEPLOY (one time, as brandon.j.neill@gmail.com):
 *   1. https://script.google.com → New project → name it "Timesheet Live".
 *   2. Replace Code.gs with this file. Save.
 *   3. In the editor ONLY, put the initial codes in SEED_CODES (see below), select
 *      function `setup` → Run → approve the permissions prompt. (Creates the two tabs,
 *      the secret pepper, and seeds the codes as peppered hashes.) Then empty SEED_CODES
 *      again and save — the plaintext codes never need to live anywhere.
 *   4. Deploy → New deployment → type "Web app" → Execute as: Me → Who has access: Anyone → Deploy.
 *   5. Copy the Web app URL (…/exec) into timesheetlive/config.js → endpoint, commit.
 *
 * MANAGE CODES: run `addCode` after editing its two arguments (or call
 *   addCode('newcode', 'Label') from the editor). Revoke by setting Active to FALSE
 *   in the TimesheetLive tab. Matching is case-insensitive and ignores spaces at the ends.
 *   Rotate everything: delete the TSL_PEPPER script property, run setup() again, re-add codes.
 */

const QUOTE_SHEET_ID     = '1uxaEppfmUoC0l1nZXS3rvsvKsysDxH5m1AyBK2biUeE'; // Neill Quote spreadsheet
const TIMESHEET_SHEET_ID = '1VG2Pejfd0ZGRpAEs65YAkVf1082O1CUeYjitZSidDl4'; // private Timesheet-Data
const CODES_TAB    = 'TimesheetLive';
const LOG_TAB      = 'TimesheetLiveLog';
const SNAPSHOT_TAB = 'live_snapshot';
// Fill these IN THE EDITOR before running setup() — never commit real codes to the
// public repo. Format: [['code', 'Label'], ...]. Clear them again after setup runs.
const SEED_CODES   = [];

const TOKEN_TTL_S          = 6 * 3600;   // CacheService max; the page silently re-unlocks after
const FAIL_WINDOW_MS       = 15 * 60 * 1000;
const MAX_FAILS_PER_DEVICE = 5;          // per 15 min per device fingerprint
const MAX_FAILS_GLOBAL     = 30;         // per 15 min across everyone (fingerprints are client-supplied)
const SNAPSHOT_CACHE_S     = 10;

/* ─────────────────────────────── web app ─────────────────────────────── */

function doGet() {
  return json_({ ok: true, msg: 'Timesheet Live backend. POST to use.' });
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  try {
    if (body.action === 'tsl_login') return json_(login_(body));
    if (body.action === 'tsl_get')   return json_(getFeed_(body));
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Server error' });
  }
}

function login_(body) {
  const codeHash = String(body.codeHash || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(codeHash)) return { ok: false, error: 'Enter a passcode' };
  const fp = String(body.fingerprint || 'nofp').replace(/[^\w.-]/g, '').slice(0, 64) || 'nofp';
  const pepper = PropertiesService.getScriptProperties().getProperty('TSL_PEPPER');
  if (!pepper) return { ok: false, error: 'Live view not set up yet' };

  const cache = CacheService.getScriptCache();
  const now = Date.now();
  const gate = checkCooldown_(cache, fp, now);
  if (gate) return gate;

  const digest = hmacHex_(codeHash, pepper);
  const match = findCode_(digest);
  if (!match) {
    const left = recordFail_(cache, fp, now);
    log_('', 'fail', fp);
    const res = { ok: false, error: 'Wrong passcode' };
    if (left <= 0) res.cooldownMs = FAIL_WINDOW_MS; else res.attemptsRemaining = left;
    return res;
  }

  cache.remove('tsl_fail_d_' + fp);
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  cache.put('tsl_tok_' + token, JSON.stringify({ label: match.label, at: now }), TOKEN_TTL_S);
  log_(match.label, 'unlock', fp);
  return { ok: true, token: token, label: match.label, ttlSec: TOKEN_TTL_S, feed: readSnapshot_() };
}

function getFeed_(body) {
  const token = String(body.token || '');
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, reauth: true };
  const raw = CacheService.getScriptCache().get('tsl_tok_' + token);
  if (!raw) return { ok: false, reauth: true };
  const sess = JSON.parse(raw);
  return { ok: true, label: sess.label, feed: readSnapshot_() };
}

/* ───────────────────────────── rate limiting ─────────────────────────── */

function readCounter_(cache, key, now) {
  try {
    const c = JSON.parse(cache.get(key) || 'null');
    if (c && now - c.first < FAIL_WINDOW_MS) return c;
  } catch (e) {}
  return { n: 0, first: now };
}
function checkCooldown_(cache, fp, now) {
  const d = readCounter_(cache, 'tsl_fail_d_' + fp, now);
  const g = readCounter_(cache, 'tsl_fail_g', now);
  if (d.n >= MAX_FAILS_PER_DEVICE) return { ok: false, error: 'Too many attempts', cooldownMs: d.first + FAIL_WINDOW_MS - now };
  if (g.n >= MAX_FAILS_GLOBAL)     return { ok: false, error: 'Too many attempts', cooldownMs: g.first + FAIL_WINDOW_MS - now };
  return null;
}
function recordFail_(cache, fp, now) {
  const lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    const d = readCounter_(cache, 'tsl_fail_d_' + fp, now);
    const g = readCounter_(cache, 'tsl_fail_g', now);
    d.n++; g.n++;
    cache.put('tsl_fail_d_' + fp, JSON.stringify(d), Math.ceil(FAIL_WINDOW_MS / 1000));
    cache.put('tsl_fail_g', JSON.stringify(g), Math.ceil(FAIL_WINDOW_MS / 1000));
    return Math.min(MAX_FAILS_PER_DEVICE - d.n, MAX_FAILS_GLOBAL - g.n);
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

/* ─────────────────────────────── codes ───────────────────────────────── */

function codesSheet_() {
  const ss = SpreadsheetApp.openById(QUOTE_SHEET_ID);
  let sh = ss.getSheetByName(CODES_TAB);
  if (!sh) {
    sh = ss.insertSheet(CODES_TAB);
    sh.getRange(1, 1, 1, 5).setValues([['Label', 'CodeHash', 'Active', 'Added', 'Notes']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function findCode_(digest) {
  const values = codesSheet_().getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const [label, hash, active] = values[i];
    if (String(hash).trim().toLowerCase() !== digest) continue;
    if (active === false || /^(false|no|0|off)$/i.test(String(active).trim())) continue;
    return { label: String(label || 'Viewer').trim() || 'Viewer' };
  }
  return null;
}
function normalizeCode_(code) { return String(code == null ? '' : code).trim().toLowerCase(); }

/** Add (or re-activate) a passcode. Run from the editor: addCode('newcode', 'Label'). */
function addCode(code, label) {
  code = normalizeCode_(code); label = String(label || '').trim() || 'Viewer';
  if (!code) throw new Error('addCode(code, label): code is empty');
  const pepper = ensurePepper_();
  const digest = hmacHex_(sha256Hex_(code), pepper);
  const sh = codesSheet_();
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][1]).trim().toLowerCase() === digest) {
      sh.getRange(i + 1, 1, 1, 3).setValues([[label, digest, true]]);
      return 'Updated ' + label;
    }
  }
  sh.appendRow([label, digest, true, new Date(), 'added via addCode()']);
  return 'Added ' + label;
}

/* ─────────────────────────────── feed ────────────────────────────────── */

function readSnapshot_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('tsl_snap');
  if (hit) return JSON.parse(hit);
  let feed = null;
  const sh = SpreadsheetApp.openById(TIMESHEET_SHEET_ID).getSheetByName(SNAPSHOT_TAB);
  if (sh) {
    const row = sh.getRange('A2:B2').getValues()[0];
    try { feed = sanitize_(JSON.parse(String(row[0] || 'null'))); } catch (e) { feed = null; }
  }
  const out = { snapshot: feed, servedAt: new Date().toISOString() };
  try { cache.put('tsl_snap', JSON.stringify(out), SNAPSHOT_CACHE_S); } catch (e) {}
  return out;
}

/** Whitelist: only display fields ever leave this script, whatever the app wrote. */
function sanitize_(s) {
  if (!s || typeof s !== 'object') return null;
  const str = (v, n) => String(v == null ? '' : v).slice(0, n || 120);
  const num = (v) => { const x = Number(v); return isFinite(x) ? Math.round(x * 100) / 100 : 0; };
  const hhmm = (v) => /^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v) : '';
  const iso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';
  const d = s.display || {};
  return {
    v: 1,
    generatedAt: str(s.generatedAt, 40),
    owner: str(s.owner, 60),
    weekStart: iso(s.weekStart), weekEnd: iso(s.weekEnd),
    display: { use24hr: d.use24hr !== false, otThresholdDay: num(d.otThresholdDay) || 8, interactiveTimes: d.interactiveTimes !== false, lowVisColours: !!d.lowVisColours },
    totals: { total: num(s.totals && s.totals.total), ot: num(s.totals && s.totals.ot), days: num(s.totals && s.totals.days) },
    days: (Array.isArray(s.days) ? s.days : []).slice(0, 7).map(function (day) {
      return {
        date: iso(day.date), dow: str(day.dow, 12), total: num(day.total), ot: num(day.ot), worked: !!day.worked,
        rows: (Array.isArray(day.rows) ? day.rows : []).slice(0, 40).map(function (r) { return { job: str(r.job), on: hhmm(r.on), off: hhmm(r.off), hrs: num(r.hrs), brk: num(r.brk) }; }),
        stat: (Array.isArray(day.stat) ? day.stat : []).slice(0, 10).map(function (r) { return { name: str(r.name, 80), type: str(r.type, 40), on: hhmm(r.on), off: hhmm(r.off) }; })
      };
    }),
    onClock: s.onClock ? { job: str(s.onClock.job), date: iso(s.onClock.date), on: hhmm(s.onClock.on), onRounded: hhmm(s.onClock.onRounded) } : null
  };
}

/* ──────────────────────────────── log ────────────────────────────────── */

function log_(label, result, fp) {
  try {
    const ss = SpreadsheetApp.openById(QUOTE_SHEET_ID);
    let sh = ss.getSheetByName(LOG_TAB);
    if (!sh) {
      sh = ss.insertSheet(LOG_TAB);
      sh.getRange(1, 1, 1, 4).setValues([['Timestamp', 'Label', 'Result', 'Device']]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    sh.appendRow([Utilities.formatDate(new Date(), 'Australia/Sydney', 'yyyy-MM-dd HH:mm:ss'), label || '', result, String(fp || '').slice(0, 20)]);
  } catch (e) { console.warn('log failed', e); }
}

/* ─────────────────────────────── setup ───────────────────────────────── */

/** One-time: creates tabs + secret pepper, seeds the initial codes. Safe to re-run. */
function setup() {
  ensurePepper_();
  codesSheet_();
  log_('setup', 'setup', 'editor');
  const results = SEED_CODES.map(function (c) { return addCode(c[0], c[1]); });
  if (!results.length) results.push('No SEED_CODES given — add codes with addCode(code, label).');
  // Touch the Timesheet-Data sheet so the authorization covers it too.
  const snap = SpreadsheetApp.openById(TIMESHEET_SHEET_ID).getSheetByName(SNAPSHOT_TAB);
  console.log(results.join('\n') + '\nSnapshot tab ' + (snap ? 'found' : 'not written yet — open the Timesheet app signed in as Brandon once'));
}

function ensurePepper_() {
  const props = PropertiesService.getScriptProperties();
  let pepper = props.getProperty('TSL_PEPPER');
  if (!pepper) { pepper = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); props.setProperty('TSL_PEPPER', pepper); }
  return pepper;
}

/* ─────────────────────────────── utils ───────────────────────────────── */

function bytesToHex_(bytes) { return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function sha256Hex_(str) { return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8)); }
function hmacHex_(value, key) { return bytesToHex_(Utilities.computeHmacSha256Signature(value, key)); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
