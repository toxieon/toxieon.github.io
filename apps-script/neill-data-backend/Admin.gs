/* Editor-run functions (Run ▸ select function). None of these are reachable
 * from the web — doPost only routes the actions in Main.gs / Quote.gs. */

/**
 * One-time (safe to re-run): creates the secret pepper, the PRIVATE backend
 * spreadsheet (Timesheet Live codes + log), the PUBLIC price sheet (copies the
 * price tabs out of the Quote spreadsheet — first run only), and seeds the
 * Timesheet Live codes from SEED_TSL_CODES. It does NOT touch Quote logins:
 * existing codes keep working on the old backend until the new URL is wired,
 * and each user's row is upgraded on their first login through the new backend.
 */
function setup() {
  ensurePepper_();
  const out = [];
  const priv = privateSS_();
  tslCodesSheet_(); tslLogSheet_();
  const junk = priv.getSheetByName('Sheet1');
  if (junk && priv.getSheets().length > 1) priv.deleteSheet(junk);
  moveLegacyTslTabs_(out);
  out.push('Private sheet (keep it Restricted): ' + priv.getUrl());

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROP.priceSheet)) {
    const ps = SpreadsheetApp.create('Neill Data — Prices (public)');
    props.setProperty(PROP.priceSheet, ps.getId());
    const names = copyPriceTabs_(quoteSS_(), ps);
    out.push('Price sheet CREATED with tabs: ' + names.join(', '));
  }
  const pid = props.getProperty(PROP.priceSheet);
  out.push('Price sheet: https://docs.google.com/spreadsheets/d/' + pid + '/edit  ← Share ▸ General access ▸ "Anyone with the link" ▸ Viewer');

  SEED_TSL_CODES.forEach(function (c) { out.push(setTimesheetLiveCode(c[0], c[1])); });
  if (!SEED_TSL_CODES.length) out.push('No SEED_TSL_CODES given (fine if they were seeded before).');
  if (SEED_TSL_CODES.length) out.push('⚠ Now empty SEED_TSL_CODES again and save.');

  // Touch every spreadsheet so the one authorization covers them all.
  const snap = SpreadsheetApp.openById(TIMESHEET_SHEET_ID).getSheetByName(SNAPSHOT_TAB);
  out.push('Timesheet snapshot tab ' + (snap ? 'found' : 'not written yet — open the Timesheet app signed in as Brandon once'));
  out.push(statusText_());
  tslLog_('setup', 'setup');
  console.log(out.join('\n'));
  return out.join('\n');
}

/* ───────────────────────────── codes ───────────────────────────── */

/** Set / reset a Quote user's passcode. Editor: setCode('Brandon', 'newcode') via a wrapper, or use CODE_CHANGES + applyCodeChanges(). */
function setCode(username, newCode) {
  const bad = validCode_(newCode); if (bad) throw new Error('setCode: ' + bad);
  ensurePepper_();
  return withLock_(function () {
    const t = table_(TAB.users, false);
    const i = findUserIdx_(t, username);
    if (i < 0) throw new Error('setCode: no Quote user named "' + username + '"');
    if (codeOwnerIdx_(t, String(newCode).trim(), i) >= 0) throw new Error('setCode: that passcode is already used by another user');
    cellSet_(t, i, 'PasswordHash', credFromCode_(String(newCode).trim(), pepper_()));
    dropSessionsFor_('q', userName_(t, t.rows[i]), null);
    logActivity_('editor', 'master', 'update_user', 'user=' + userName_(t, t.rows[i]) + ' passcode changed (editor)', '', 'ok');
    return 'Quote passcode set for ' + userName_(t, t.rows[i]);
  });
}

/** Add or replace the Timesheet Live code for `label` (case-insensitive code). */
function setTimesheetLiveCode(label, code) {
  label = String(label || '').trim() || 'Viewer';
  code = normTslCode_(code);
  if (!code) throw new Error('setTimesheetLiveCode(label, code): code is empty');
  const digest = credFromLegacy_(sha256Hex_(code), ensurePepper_());
  const sh = tslCodesSheet_();
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][1]).trim().toLowerCase() === digest.toLowerCase() && String(values[i][0]).trim().toLowerCase() !== label.toLowerCase()) {
      throw new Error('setTimesheetLiveCode: that code is already used by "' + values[i][0] + '"');
    }
  }
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === label.toLowerCase()) {
      sh.getRange(i + 1, 1, 1, 3).setValues([[label, digest, true]]);
      dropSessionsFor_('tsl', label, null);
      CacheService.getScriptCache().remove('tsl_act_' + sha256Hex_(label.toLowerCase()).slice(0, 24));
      return 'Timesheet Live code replaced for ' + label;
    }
  }
  sh.appendRow([label, digest, true, new Date(), 'set via setTimesheetLiveCode()']);
  return 'Timesheet Live code added for ' + label;
}

/** Turn a Timesheet Live viewer off (their open sessions end within a minute). */
function revokeTimesheetLiveCode(label) {
  const sh = tslCodesSheet_();
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === String(label).trim().toLowerCase()) sh.getRange(i + 1, 3).setValue(false);
  }
  dropSessionsFor_('tsl', label, null);
  CacheService.getScriptCache().remove('tsl_act_' + sha256Hex_(String(label).trim().toLowerCase()).slice(0, 24));
  return 'Revoked ' + label;
}

/** Apply CODE_CHANGES (fill in the editor, Run, then empty it again and save). */
function applyCodeChanges() {
  const out = [];
  (CODE_CHANGES.quote || []).forEach(function (c) { out.push(setCode(c[0], c[1])); });
  (CODE_CHANGES.timesheetLive || []).forEach(function (c) { out.push(setTimesheetLiveCode(c[0], c[1])); });
  if (!out.length) out.push('CODE_CHANGES is empty — nothing to do.');
  else out.push('⚠ Now empty CODE_CHANGES again and save.');
  console.log(out.join('\n'));
  return out.join('\n');
}

/**
 * Upgrade every remaining legacy (plain SHA-256) Quote row to the peppered form.
 * Run ONLY after the new /exec URL is wired and Quote works on it: upgraded rows
 * no longer log in through the OLD Quote backend.
 */
function migrateAllUsers() {
  const pepper = ensurePepper_();
  return withLock_(function () {
    const t = table_(TAB.users, false);
    const c = col_(t, 'PasswordHash');
    let n = 0;
    t.rows.forEach(function (r, i) {
      if (isLegacyHash_(r[c])) { t.sh.getRange(i + 2, c + 1).setValue(credFromLegacy_(String(r[c]).trim(), pepper)); n++; }
    });
    const msg = 'Upgraded ' + n + ' legacy Quote login(s).';
    console.log(msg);
    return msg;
  });
}

/** Clear all login rate-limit counters (e.g. after someone locked everyone out). */
function resetLoginLimits() {
  const cache = CacheService.getScriptCache();
  cache.removeAll(['rl_q_g', 'rl_tsl_g']);
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('rl_q_day'); props.deleteProperty('rl_tsl_day');
  return 'Global login limits reset (per-user limits expire on their own within 15 minutes).';
}

/** Sign every Quote and Timesheet Live session out. */
function signOutEveryone() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  let n = 0;
  Object.keys(all).forEach(function (k) { if (k.indexOf(SESS_PREFIX) === 0) { props.deleteProperty(k); n++; } });
  return 'Ended ' + n + ' session(s).';
}

/* ───────────────────────────── prices ───────────────────────────── */

function priceTabNames_(src) {
  return src.getSheets().map(function (s) { return s.getName(); })
    .filter(function (n) { return PRIVATE_TABS.indexOf(n) < 0 && n.charAt(0) !== '_'; });
}
/** Copies each price tab (values + formatting) from `src` into `dst`, replacing same-named tabs. */
function copyPriceTabs_(src, dst) {
  const names = priceTabNames_(src);
  names.forEach(function (name) {
    const from = src.getSheetByName(name);
    const copy = from.copyTo(dst);
    const rng = from.getDataRange();
    const vals = rng.getValues();
    if (vals.length && vals[0].length) copy.getRange(1, 1, vals.length, vals[0].length).setValues(vals);   // static values, no cross-tab formulas
    const old = dst.getSheetByName(name);
    if (old) dst.deleteSheet(old);
    copy.setName(name);
  });
  dst.getSheets().forEach(function (s) { if (names.indexOf(s.getName()) < 0 && dst.getSheets().length > 1) dst.deleteSheet(s); });
  return names;
}
/**
 * Re-copy the price tabs from the Quote spreadsheet to the public price sheet.
 * Only needed if you keep editing prices in the Quote spreadsheet — it
 * OVERWRITES the price sheet's tabs.
 */
function syncPriceSheet() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP.priceSheet);
  if (!id) throw new Error('Run setup() first');
  const names = copyPriceTabs_(quoteSS_(), SpreadsheetApp.openById(id));
  const msg = 'Copied price tabs: ' + names.join(', ');
  console.log(msg);
  return msg;
}
/** Optional: keep editing prices in the Quote spreadsheet and mirror them every hour. */
function installHourlyPriceSync() {
  removeHourlyPriceSync();
  ScriptApp.newTrigger('syncPriceSheet').timeBased().everyHours(1).create();
  return 'Hourly price sync installed — edit prices in the Quote spreadsheet, NOT in the price sheet.';
}
function removeHourlyPriceSync() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncPriceSheet') ScriptApp.deleteTrigger(t); });
  return 'Hourly price sync removed.';
}

/* ───────────────────────────── status ───────────────────────────── */

function status() { const s = statusText_(); console.log(s); return s; }
function statusText_() {
  const props = PropertiesService.getScriptProperties();
  const t = table_(TAB.users, false);
  const c = col_(t, 'PasswordHash');
  let legacy = 0, v2 = 0, other = 0;
  t.rows.forEach(function (r) {
    if (!userName_(t, r)) return;
    const h = String(r[c] || '').trim();
    if (h.indexOf('v2$') === 0) v2++; else if (isLegacyHash_(h)) legacy++; else other++;
  });
  const sessions = Object.keys(props.getProperties()).filter(function (k) { return k.indexOf(SESS_PREFIX) === 0; }).length;
  return 'Quote users: ' + (legacy + v2 + other) + ' (' + v2 + ' upgraded, ' + legacy + ' legacy' + (other ? ', ' + other + ' with no usable code' : '') + ')' +
    '\nPepper: ' + (props.getProperty(PROP.pepper) ? 'set' : 'MISSING') +
    '\nPrice sheet: ' + (props.getProperty(PROP.priceSheet) || 'not created') +
    '\nPrivate sheet: ' + (props.getProperty(PROP.privateSheet) || 'not created') +
    '\nOpen sessions: ' + sessions;
}

/* Earlier Timesheet Live design kept its tabs in the Quote spreadsheet — move any rows across. */
function moveLegacyTslTabs_(out) {
  const q = quoteSS_();
  [[TSL_CODES_TAB, tslCodesSheet_], [TSL_LOG_TAB, tslLogSheet_]].forEach(function (p) {
    const old = q.getSheetByName(p[0]);
    if (!old) return;
    const vals = old.getDataRange().getValues().slice(1).filter(function (r) { return r.some(String); });
    if (p[0] === TSL_CODES_TAB && vals.length) {
      out.push('Old TimesheetLive tab found in the Quote sheet — its codes used a different format, re-add them with setTimesheetLiveCode().');
    } else if (vals.length) {
      const dst = p[1]();
      dst.getRange(dst.getLastRow() + 1, 1, vals.length, Math.min(3, vals[0].length)).setValues(vals.map(function (r) { return r.slice(0, 3); }));
    }
    q.deleteSheet(old);
    out.push('Removed tab ' + p[0] + ' from the Quote spreadsheet.');
  });
}
