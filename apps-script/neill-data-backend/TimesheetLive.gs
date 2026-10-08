/* Timesheet Live — passcode-gated, read-only feed for https://www.neilldata.com/timesheetlive/
 *
 *   Codes → PRIVATE spreadsheet (Script Property PRIVATE_SHEET_ID), tab "TimesheetLive"
 *   Log   → PRIVATE spreadsheet, tab "TimesheetLiveLog"
 *   Data  → private Timesheet-Data spreadsheet, tab "live_snapshot" (written by the
 *           signed-in Timesheet app; this script only READS it)
 * The private spreadsheet is created by setup(); it is never link-shared.
 * Codes are case-insensitive (trimmed, lower-cased) and stored peppered (Auth.gs).
 * The page sends the code itself; a good code returns a 14-hour session token. */

function privateSS_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(PROP.privateSheet);
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.create('Neill Data — Backend (private)');
  props.setProperty(PROP.privateSheet, ss.getId());
  return ss;
}
function privateTab_(name, headers) {
  const ss = privateSS_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function tslCodesSheet_() { return privateTab_(TSL_CODES_TAB, ['Label', 'CodeHash', 'Active', 'Added', 'Notes']); }
function tslLogSheet_()   { return privateTab_(TSL_LOG_TAB, ['Timestamp', 'Label', 'Result']); }
function normTslCode_(code) { return String(code == null ? '' : code).trim().toLowerCase(); }
function tslActive_(v) { return !(v === false || /^(false|no|0|off)$/i.test(String(v).trim())); }

function tslLogin_(body) {
  const code = normTslCode_(body.code);
  if (!code) return { ok: false, error: 'Enter a passcode' };
  if (code.length > 128) return { ok: false, error: 'Wrong passcode' };
  const pepper = pepper_();
  if (!pepper || !PropertiesService.getScriptProperties().getProperty(PROP.privateSheet)) return { ok: false, error: 'Live view not set up yet' };
  const early = loginGate_('tsl', '');
  if (early) return { ok: false, error: 'Too many attempts', cooldownMs: early.cooldownMs };

  const legacy = sha256Hex_(code);
  const v2 = credFromLegacy_(legacy, pepper);
  const values = tslCodesSheet_().getDataRange().getValues();
  let label = '';
  for (let i = 1; i < values.length; i++) {
    const stored = String(values[i][1] || '').trim();
    if (stored.indexOf('v2$') !== 0 || !safeEq_(stored.toLowerCase(), v2.toLowerCase())) continue;
    if (!tslActive_(values[i][2])) continue;
    label = String(values[i][0] || 'Viewer').trim() || 'Viewer';
    break;
  }
  const blocked = settleLogin_('tsl', '', label ? 'ok' : 'fail');
  if (blocked) {
    if (!label) tslLog_('', 'fail');
    if (blocked.error === 'invalid passcode') {
      const res = { ok: false, error: 'Wrong passcode' };
      if (blocked.cooldownMs) res.cooldownMs = blocked.cooldownMs;
      if (blocked.attemptsRemaining !== undefined) res.attemptsRemaining = blocked.attemptsRemaining;
      return res;
    }
    return { ok: false, error: 'Too many attempts', cooldownMs: blocked.cooldownMs || FAIL_WINDOW_MS };
  }
  const token = newSession_('tsl', label, TSL_SESSION_TTL_MS);
  tslLog_(label, 'unlock');
  return { ok: true, token: token, label: label, ttlSec: Math.floor(TSL_SESSION_TTL_MS / 1000), feed: readSnapshot_() };
}

function tslGet_(body) {
  const s = getSession_('tsl', body.token);
  if (!s) return { ok: false, reauth: true };
  if (!tslLabelActive_(s.u)) { dropSession_(body.token); return { ok: false, reauth: true }; }
  return { ok: true, label: s.u, feed: readSnapshot_() };
}
function tslLogout_(body) { dropSession_(body.token); return { ok: true }; }

/** Revoked (Active = FALSE) or deleted labels lose their sessions on the next poll. Cached 60 s. */
function tslLabelActive_(label) {
  const cache = CacheService.getScriptCache();
  const key = 'tsl_act_' + sha256Hex_(String(label).toLowerCase()).slice(0, 24);
  const hit = cache.get(key);
  if (hit) return hit === '1';
  const values = tslCodesSheet_().getDataRange().getValues();
  let ok = false;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === String(label).toLowerCase() && tslActive_(values[i][2])) { ok = true; break; }
  }
  cache.put(key, ok ? '1' : '0', 60);
  return ok;
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

function tslLog_(label, result) {
  try {
    tslLogSheet_().appendRow([Utilities.formatDate(new Date(), 'Australia/Sydney', 'yyyy-MM-dd HH:mm:ss'), label || '', result]);
  } catch (e) { console.warn('log failed', e); }
}
