/* Neill Quote backend — reimplements every action the Quote client (and the
 * Timesheet bridge / Checklist login) used on the legacy Quote script, with the
 * same request/response shapes, except that auth is now a server session:
 *   login {code}          → {ok, user, token}   (was {passwordHash} → {ok, user})
 *   every other action     sends {token}          (was the stored passwordHash)
 * Sheet layout is unchanged (Users / Quotes / Invoices / Activity / Photos / Tags). */

/* ───────────────────────────── sheet helpers ───────────────────────────── */

let SS_ = null;
function quoteSS_() { return SS_ || (SS_ = SpreadsheetApp.openById(QUOTE_SHEET_ID)); }
function sheet_(name, create) {
  const ss = quoteSS_();
  let sh = ss.getSheetByName(name);
  if (!sh && create) {
    sh = ss.insertSheet(name);
    if (HEADERS[name]) { sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]); sh.setFrozenRows(1); }
  }
  return sh;
}
/** {sh, head, rows, idx} — rows exclude the header; sheet row of rows[i] is i + 2. */
function table_(name, create) {
  const sh = sheet_(name, create);
  const values = sh ? sh.getDataRange().getValues() : [];
  const head = (values.length && values[0].some(function (h) { return String(h).trim(); })) ? values[0].map(String) : (HEADERS[name] || []).slice();
  const idx = {};
  head.forEach(function (h, i) { const k = normKey_(h); if (k && idx[k] === undefined) idx[k] = i; });
  return { name: name, sh: sh, head: head, rows: values.slice(1), idx: idx };
}
function col_(t, name) { const i = t.idx[normKey_(name)]; return i === undefined ? -1 : i; }
/** Column index for `name`, adding the header at the end if the sheet lacks it. */
function ensureCol_(t, name) {
  let i = col_(t, name);
  if (i >= 0) return i;
  i = t.head.length;
  t.head.push(name); t.idx[normKey_(name)] = i;
  t.sh.getRange(1, i + 1).setValue(name);
  return i;
}
function cellGet_(t, r, name) { const i = col_(t, name); return i < 0 ? '' : r[i]; }
function cellSet_(t, rowIdx, name, value) {
  const i = ensureCol_(t, name);
  t.sh.getRange(rowIdx + 2, i + 1).setValue(value);
  if (t.rows[rowIdx]) t.rows[rowIdx][i] = value;
}
function rowFromObj_(t, obj) {
  Object.keys(obj).forEach(function (k) { ensureCol_(t, k); });
  const row = t.head.map(function () { return ''; });
  Object.keys(obj).forEach(function (k) { row[col_(t, k)] = obj[k]; });
  return row;
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { error: 'busy — try again' };
  try { return fn(); } finally { try { lock.releaseLock(); } catch (e) {} }
}
function dateOnly_(v) {
  if (isDate_(v)) return Utilities.formatDate(v, 'Australia/Sydney', 'yyyy-MM-dd');
  return String(v == null ? '' : v);
}
function parseJson_(v, fallback) {
  if (v && typeof v === 'object') return v;
  try { const x = JSON.parse(String(v || '')); return (x === null || x === undefined) ? fallback : x; } catch (e) { return fallback; }
}

/* ───────────────────────────── users ───────────────────────────── */

const ROLES = ['master', 'admin', 'staff'];
function roleOf_(t, r) { const x = String(cellGet_(t, r, 'Role') || '').trim().toLowerCase(); return ROLES.indexOf(x) >= 0 ? x : 'staff'; }
function userName_(t, r) { return String(cellGet_(t, r, 'Username') || '').trim(); }
function findUserIdx_(t, name) {
  const want = String(name || '').trim().toLowerCase();
  if (!want) return -1;
  for (let i = 0; i < t.rows.length; i++) if (userName_(t, t.rows[i]).toLowerCase() === want) return i;
  return -1;
}
function publicUser_(t, r) {
  const cap = cellGet_(t, r, 'Discount Cap');
  return {
    username: userName_(t, r),
    role: roleOf_(t, r),
    locked: truthy_(cellGet_(t, r, 'Locked')),
    phone: str_(cellGet_(t, r, 'Phone')),
    email: str_(cellGet_(t, r, 'Email')),
    startDate: dateOnly_(cellGet_(t, r, 'Start Date')),
    address: str_(cellGet_(t, r, 'Address')),
    discountCap: (cap === '' || cap === null || isNaN(Number(cap))) ? null : Number(cap),
    notes: str_(cellGet_(t, r, 'Notes'), 5000),
    favourites: parseJson_(cellGet_(t, r, 'Favourites'), {}),
    products: parseJson_(cellGet_(t, r, 'Products'), [])
  };
}
/** Index of a user (≠ exceptIdx) whose stored credential matches `code`, else -1. */
function codeOwnerIdx_(t, code, exceptIdx) {
  const pepper = pepper_();
  const legacy = sha256Hex_(String(code));
  const v2 = credFromLegacy_(legacy, pepper);
  const c = col_(t, 'PasswordHash');
  if (c < 0) return -1;
  for (let i = 0; i < t.rows.length; i++) {
    if (i === exceptIdx) continue;
    if (credMatch_(t.rows[i][c], legacy, v2)) return i;
  }
  return -1;
}
function validCode_(code) {
  code = String(code == null ? '' : code).trim();
  if (!code) return 'passcode is required';
  if (code.length < 4) return 'passcode must be at least 4 characters';
  if (code.length > 64) return 'passcode is too long';
  return '';
}
function unlockedMasters_(t) {
  return t.rows.filter(function (r) { return userName_(t, r) && roleOf_(t, r) === 'master' && !truthy_(cellGet_(t, r, 'Locked')); }).length;
}

/* ───────────────────────────── login / auth ───────────────────────────── */

function quoteLogin_(body) {
  const code = String(body.code == null ? '' : body.code);
  const fp = str_(body.fingerprint, 64);
  if (!code.trim()) return { ok: false, error: 'enter your passcode' };
  if (code.length > 128) return { ok: false, error: 'invalid passcode' };
  const pepper = pepper_();
  if (!pepper) return { ok: false, error: 'backend not set up yet — run setup()' };
  const named = str_(body.username, 80).trim();
  if (!named && PropertiesService.getScriptProperties().getProperty(PROP.requireUsername) === 'true') {
    return { ok: false, error: 'enter your name and passcode', needUsername: true };
  }
  const gate = loginGate_('q', named);
  if (gate) return gate;

  const t = table_(TAB.users, false);
  const legacy = sha256Hex_(code);
  const v2 = credFromLegacy_(legacy, pepper);
  const hc = col_(t, 'PasswordHash');
  let idx = -1, kind = '';
  for (let i = 0; hc >= 0 && i < t.rows.length; i++) {
    if (named && userName_(t, t.rows[i]).toLowerCase() !== named.toLowerCase()) continue;
    kind = credMatch_(t.rows[i][hc], legacy, v2);
    if (kind) { idx = i; break; }
  }
  if (idx < 0) {
    const left = loginFail_('q', named);
    logActivity_('', '', 'login', 'invalid passcode', fp, 'fail');
    return failResponse_(left, 'q', named);
  }
  const r = t.rows[idx];
  const user = publicUser_(t, r);
  if (user.locked) {
    logActivity_(user.username, user.role, 'login', 'account locked', fp, 'fail');
    return { ok: false, error: 'account locked', locked: true };
  }
  loginOk_('q', named);
  if (kind === 'legacy') {   // one-time upgrade of the plain SHA-256 row
    withLock_(function () { t.sh.getRange(idx + 2, hc + 1).setValue(v2); return null; });
  }
  const token = newSession_('q', user.username, QUOTE_SESSION_TTL_MS);
  logActivity_(user.username, user.role, 'login', kind === 'legacy' ? 'success (hash upgraded)' : 'success', fp, 'ok');
  return { ok: true, user: user, token: token, ttlSec: Math.floor(QUOTE_SESSION_TTL_MS / 1000) };
}

function authQuote_(body) {
  const s = getSession_('q', body.token);
  if (!s) return { denied: { error: 'session expired — enter your passcode again', reauth: true } };
  const t = table_(TAB.users, false);
  const i = findUserIdx_(t, s.u);
  if (i < 0) { dropSession_(body.token); return { denied: { error: 'account removed', locked: true } }; }
  const r = t.rows[i];
  if (truthy_(cellGet_(t, r, 'Locked'))) return { denied: { error: 'account locked', locked: true } };
  return { user: { username: userName_(t, r), role: roleOf_(t, r) }, users: t, userIdx: i, token: body.token, sessKey: s.key, fp: str_(body.fingerprint, 64) };
}
function isMasterCtx_(ctx) { return ctx.user.role === 'master'; }
function isStaffCtx_(ctx)  { return ctx.user.role === 'staff'; }
function needMaster_(ctx)  { return isMasterCtx_(ctx) ? null : { error: 'master only' }; }
function log_(ctx, action, detail, result) { logActivity_(ctx.user.username, ctx.user.role, action, detail, ctx.fp, result || 'ok'); }

function logActivity_(username, role, action, detail, fp, result) {
  try {
    sheet_(TAB.activity, true).appendRow([new Date(), username || '', role || '', action, str_(detail, 500), str_(fp, 64), result || 'ok']);
  } catch (e) { console.warn('activity log failed', e); }
}

/* ───────────────────────────── quotes ───────────────────────────── */

function jobStatus_(q) {
  if (!q) return 'quote';
  if (q.status === 'quote' || q.status === 'in_progress' || q.status === 'complete') return q.status;
  return q.completed ? 'complete' : 'quote';
}
function quoteFromRow_(t, r) {
  let q = parseJson_(cellGet_(t, r, 'JSON Data'), null);
  if (!q || typeof q !== 'object' || Array.isArray(q)) q = {};
  const owner = String(cellGet_(t, r, 'Username') || '').trim();
  q.id = q.id || String(cellGet_(t, r, 'ID'));
  if (owner) q.username = owner;
  if (!q.createdAt) q.createdAt = iso_(cellGet_(t, r, 'Created At'));
  if (q.grand === undefined || q.grand === null) q.grand = Number(cellGet_(t, r, 'Total')) || 0;
  if (!q.client) q.client = { name: str_(cellGet_(t, r, 'Client Name')), address: str_(cellGet_(t, r, 'Client Address')) };
  if (q.cashMode === undefined) q.cashMode = truthy_(cellGet_(t, r, 'Cash Mode'));
  return q;
}
/** Staff see quotes they own, and jobs they're rostered to once released (not at Quote stage). */
function staffCanSee_(q, me) {
  me = String(me || '').toLowerCase();
  if (!me) return false;
  if (String(q.username || '').toLowerCase() === me) return true;
  const a = Array.isArray(q.assignees) ? q.assignees.map(function (x) { return String(x).toLowerCase(); }) : [];
  return a.indexOf(me) >= 0 && jobStatus_(q) !== 'quote';
}
function findQuoteIdx_(t, id) {
  const c = col_(t, 'ID');
  for (let i = 0; c >= 0 && i < t.rows.length; i++) if (String(t.rows[i][c]) === String(id)) return i;
  return -1;
}
function quoteTotal_(q) { const n = Number(q.grand !== undefined ? q.grand : q.total); return isFinite(n) ? n : 0; }

function getQuotes_(body, ctx) {
  const t = table_(TAB.quotes, false);
  const target = str_(body.targetUser, 80).trim().toLowerCase();
  if (target && !isMasterCtx_(ctx)) return { error: 'master only' };
  const out = [];
  t.rows.forEach(function (r) {
    if (!String(cellGet_(t, r, 'ID')).trim()) return;
    const q = quoteFromRow_(t, r);
    if (target) { if (String(q.username || '').toLowerCase() === target) out.push(q); return; }
    if (isStaffCtx_(ctx) && !staffCanSee_(q, ctx.user.username)) return;
    out.push(q);
  });
  return { ok: true, quotes: out };
}

function saveQuote_(body, ctx) {
  const quote = body.quote;
  if (!quote || typeof quote !== 'object' || !quote.id) return { error: 'quote with id required' };
  const id = str_(quote.id, 80);
  const json = JSON.stringify(quote);
  if (json.length > MAX_CELL) return { error: 'quote too large to save (' + json.length + ' chars) — remove photos from the quote data' };
  return withLock_(function () {
    const t = table_(TAB.quotes, true);
    const i = findQuoteIdx_(t, id);
    const client = quote.client || {};
    if (i >= 0) {
      const existing = quoteFromRow_(t, t.rows[i]);
      if (isStaffCtx_(ctx) && !staffCanSee_(existing, ctx.user.username)) return { error: 'not allowed' };
      const owner = String(cellGet_(t, t.rows[i], 'Username') || '') || ctx.user.username;
      const row = rowFromObj_(t, {
        'ID': id, 'Username': owner, 'Created At': cellGet_(t, t.rows[i], 'Created At') || quote.createdAt || new Date().toISOString(),
        'Client Name': str_(client.name), 'Client Address': str_(client.address), 'Total': quoteTotal_(quote),
        'Cash Mode': !!quote.cashMode, 'JSON Data': json
      });
      t.sh.getRange(i + 2, 1, 1, row.length).setValues([row]);
      syncInvoiceJson_(id, json, quoteTotal_(quote));
      log_(ctx, 'save_quote', 'id=' + id + ' (update)');
    } else {
      t.sh.appendRow(rowFromObj_(t, {
        'ID': id, 'Username': ctx.user.username, 'Created At': quote.createdAt || new Date().toISOString(),
        'Client Name': str_(client.name), 'Client Address': str_(client.address), 'Total': quoteTotal_(quote),
        'Cash Mode': !!quote.cashMode, 'JSON Data': json
      }));
      log_(ctx, 'save_quote', 'id=' + id + ' (new)');
    }
    return { ok: true, id: id };
  });
}

function deleteQuote_(body, ctx) {
  if (isStaffCtx_(ctx)) return { error: 'not allowed' };
  const id = str_(body.id, 80);
  if (!id) return { error: 'id required' };
  return withLock_(function () {
    const t = table_(TAB.quotes, false);
    let n = 0;
    for (let i = t.rows.length - 1; i >= 0; i--) {
      if (String(cellGet_(t, t.rows[i], 'ID')) === id) { t.sh.deleteRow(i + 2); n++; }
    }
    removeInvoice_(id);
    log_(ctx, 'delete_quote', 'id=' + id);
    return { ok: true, deleted: n };
  });
}

/* Invoices tab: no header row. [ID, Username, Created At, Completed At, Client Name, Client Address, Total, Cash Mode, JSON] */
function invoiceSheet_(create) {
  const ss = quoteSS_();
  return ss.getSheetByName(TAB.invoices) || (create ? ss.insertSheet(TAB.invoices) : null);
}
function invoiceRowIdx_(sh, id) {
  if (!sh || sh.getLastRow() < 1) return -1;
  const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 1;
  return -1;
}
function upsertInvoice_(owner, q) {
  const sh = invoiceSheet_(true);
  const row = [q.id, owner, q.createdAt || '', q.completedAt || new Date().toISOString(),
    str_(q.client && q.client.name), str_(q.client && q.client.address), quoteTotal_(q), !!q.cashMode, JSON.stringify(q)];
  const at = invoiceRowIdx_(sh, q.id);
  if (at > 0) sh.getRange(at, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
}
function removeInvoice_(id) {
  const sh = invoiceSheet_(false);
  let at;
  while (sh && (at = invoiceRowIdx_(sh, id)) > 0) sh.deleteRow(at);
}
function syncInvoiceJson_(id, json, total) {
  const sh = invoiceSheet_(false);
  const at = invoiceRowIdx_(sh, id);
  if (at > 0) { sh.getRange(at, 7).setValue(total); sh.getRange(at, 9).setValue(json); }
}

function setStatus_(body, ctx) {
  const id = str_(body.id, 80);
  const status = String(body.status || '');
  if (!id) return { error: 'id required' };
  if (['quote', 'in_progress', 'complete'].indexOf(status) < 0) return { error: 'bad status' };
  return withLock_(function () {
    const t = table_(TAB.quotes, false);
    const i = findQuoteIdx_(t, id);
    if (i < 0) return { error: 'quote not found' };
    const q = quoteFromRow_(t, t.rows[i]);
    const from = jobStatus_(q);
    if (isStaffCtx_(ctx)) {
      // staff can only mark a released job they can see as complete
      if (!staffCanSee_(q, ctx.user.username) || status !== 'complete' || from !== 'in_progress') return { error: 'not allowed' };
    }
    q.status = status;
    if (status === 'complete') { q.completed = true; q.completedAt = q.completedAt || new Date().toISOString(); }
    else { q.completed = false; delete q.completedAt; }
    if (status === 'in_progress' && !q.inProgressAt) q.inProgressAt = new Date().toISOString();
    if (body.timingHonest !== undefined) q.timingHonest = body.timingHonest;
    if (body.overrunHours !== undefined) q.overrunHours = body.overrunHours;
    const owner = String(cellGet_(t, t.rows[i], 'Username') || '');
    cellSet_(t, i, 'JSON Data', JSON.stringify(q));
    if (status === 'complete') upsertInvoice_(owner, q); else removeInvoice_(id);
    log_(ctx, 'set_status', id + ' ' + from + ' -> ' + status);
    return { ok: true, id: id, status: status };
  });
}

function setFavourites_(body, ctx) {
  const fav = (body.favourites && typeof body.favourites === 'object') ? body.favourites : {};
  const json = JSON.stringify(fav);
  if (json.length > MAX_CELL) return { error: 'too many favourites' };
  return withLock_(function () {
    const t = table_(TAB.users, false);
    const i = findUserIdx_(t, ctx.user.username);
    if (i < 0) return { error: 'account removed', locked: true };
    cellSet_(t, i, 'Favourites', json);
    return { ok: true };
  });
}

function getInvoices_(body, ctx) {
  if (isStaffCtx_(ctx)) return { error: 'not allowed' };
  const sh = invoiceSheet_(false);
  if (!sh || sh.getLastRow() < 1) return { ok: true, invoices: [] };
  const rows = sh.getRange(1, 1, sh.getLastRow(), 9).getValues();
  return { ok: true, invoices: rows.filter(function (r) { return String(r[0]).trim(); }).map(function (r) {
    return { id: String(r[0]), username: String(r[1]), createdAt: iso_(r[2]), completedAt: iso_(r[3]), clientName: str_(r[4]),
      clientAddress: str_(r[5]), total: Number(r[6]) || 0, cashMode: truthy_(r[7]), quote: parseJson_(r[8], null) };
  }) };
}

/* ───────────────────────────── staff admin (master) ───────────────────────────── */

function getUsers_(body, ctx) {
  const deny = needMaster_(ctx); if (deny) return deny;
  const t = ctx.users;
  const qt = table_(TAB.quotes, false);
  const stats = {};
  qt.rows.forEach(function (r) {
    const u = String(cellGet_(qt, r, 'Username') || '').toLowerCase();
    if (!u) return;
    stats[u] = stats[u] || { n: 0, total: 0 };
    stats[u].n++; stats[u].total += Number(cellGet_(qt, r, 'Total')) || 0;
  });
  const users = t.rows.filter(function (r) { return userName_(t, r); }).map(function (r) {
    const u = publicUser_(t, r);
    const s = stats[u.username.toLowerCase()] || { n: 0, total: 0 };
    u.quoteCount = s.n; u.quoteTotal = Math.round(s.total * 100) / 100;
    return u;
  });
  return { ok: true, users: users };
}

function updateUser_(body, ctx) {
  const deny = needMaster_(ctx); if (deny) return deny;
  const u = body.updates || {};
  if (u.passwordHash !== undefined) return { error: 'this version of the app is out of date — reload and try again' };
  return withLock_(function () {
    const t = table_(TAB.users, false);
    const i = findUserIdx_(t, body.target);
    if (i < 0) return { error: 'user not found' };
    const oldName = userName_(t, t.rows[i]);
    const isSelf = oldName.toLowerCase() === ctx.user.username.toLowerCase();
    const wasMaster = roleOf_(t, t.rows[i]) === 'master' && !truthy_(cellGet_(t, t.rows[i], 'Locked'));
    if (u.role !== undefined && ROLES.indexOf(String(u.role)) < 0) return { error: 'bad role' };
    if (isSelf && u.role !== undefined && u.role !== 'master') return { error: "you can't change your own role" };
    if (isSelf && truthy_(u.locked)) return { error: "you can't lock yourself out" };
    if (wasMaster && unlockedMasters_(t) <= 1 && ((u.role !== undefined && u.role !== 'master') || truthy_(u.locked))) return { error: 'keep at least one unlocked master' };
    const newName = u.newUsername !== undefined ? String(u.newUsername).trim() : '';
    if (newName && newName.toLowerCase() !== oldName.toLowerCase() && findUserIdx_(t, newName) >= 0) return { error: 'username already exists' };
    const newCode = u.newCode !== undefined ? String(u.newCode).trim() : '';
    if (newCode) {
      const bad = validCode_(newCode); if (bad) return { error: bad };
      if (codeOwnerIdx_(t, newCode, i) >= 0) return { error: 'passcode already in use — passcodes must be unique' };
    }
    const set = function (name, v) { if (v !== undefined) cellSet_(t, i, name, v); };
    set('Role', u.role);
    if (u.locked !== undefined) set('Locked', !!truthy_(u.locked));
    ['phone:Phone', 'email:Email', 'startDate:Start Date', 'address:Address', 'notes:Notes'].forEach(function (p) {
      const kv = p.split(':'); if (u[kv[0]] !== undefined) set(kv[1], str_(u[kv[0]], 5000));
    });
    if (u.discountCap !== undefined) set('Discount Cap', (u.discountCap === null || u.discountCap === '') ? '' : Number(u.discountCap));
    if (u.products !== undefined && Array.isArray(u.products)) set('Products', JSON.stringify(u.products.map(String)));
    if (newCode) {
      set('PasswordHash', credFromCode_(newCode, pepper_()));
      dropSessionsFor_('q', oldName, isSelf ? ctx.sessKey : null);   // old code's sessions end
    }
    if (truthy_(u.locked)) dropSessionsFor_('q', oldName, null);
    let finalName = oldName;
    if (newName && newName !== oldName) {
      set('Username', newName); finalName = newName;
      renameOwner_(oldName, newName);
      renameSessions_('q', oldName, newName);
    }
    log_(ctx, 'update_user', 'user=' + finalName + (newName && newName !== oldName ? ' (was ' + oldName + ')' : '') + (newCode ? ' passcode changed' : ''));
    return { ok: true };
  });
}
/** Rename carries quote ownership, roster (assignees) and invoices across. */
function renameOwner_(from, to) {
  const lc = from.toLowerCase();
  const t = table_(TAB.quotes, false);
  const c = col_(t, 'Username'), jc = col_(t, 'JSON Data');
  t.rows.forEach(function (r, i) {
    if (c >= 0 && String(r[c]).toLowerCase() === lc) t.sh.getRange(i + 2, c + 1).setValue(to);
    if (jc < 0) return;
    const q = parseJson_(r[jc], null);
    if (!q || typeof q !== 'object') return;
    let changed = false;
    if (Array.isArray(q.assignees)) q.assignees = q.assignees.map(function (a) { if (String(a).toLowerCase() === lc) { changed = true; return to; } return a; });
    if (q.username && String(q.username).toLowerCase() === lc) { q.username = to; changed = true; }
    if (changed) t.sh.getRange(i + 2, jc + 1).setValue(JSON.stringify(q));
  });
  const inv = invoiceSheet_(false);
  if (inv && inv.getLastRow() > 0) {
    const vals = inv.getRange(1, 2, inv.getLastRow(), 1).getValues();
    vals.forEach(function (v, i) { if (String(v[0]).toLowerCase() === from.toLowerCase()) inv.getRange(i + 1, 2).setValue(to); });
  }
}

function createUser_(body, ctx) {
  const deny = needMaster_(ctx); if (deny) return deny;
  const n = body.newUser || {};
  if (n.passwordHash !== undefined && n.code === undefined) return { error: 'this version of the app is out of date — reload and try again' };
  const username = str_(n.username, 80).trim();
  const code = String(n.code == null ? '' : n.code).trim();
  if (!username) return { error: 'username is required' };
  const bad = validCode_(code); if (bad) return { error: bad };
  const role = ROLES.indexOf(String(n.role)) >= 0 ? String(n.role) : 'staff';
  return withLock_(function () {
    const t = table_(TAB.users, true);
    if (findUserIdx_(t, username) >= 0) return { error: 'username already exists' };
    if (codeOwnerIdx_(t, code, -1) >= 0) return { error: 'passcode already in use — passcodes must be unique' };
    t.sh.appendRow(rowFromObj_(t, {
      'Username': username, 'PasswordHash': credFromCode_(code, pepper_()), 'Role': role, 'Locked': false,
      'Phone': str_(n.phone), 'Email': str_(n.email), 'Start Date': str_(n.startDate), 'Address': str_(n.address),
      'Discount Cap': (n.discountCap === undefined || n.discountCap === null || n.discountCap === '') ? '' : Number(n.discountCap),
      'Notes': str_(n.notes, 5000), 'Favourites': '{}',
      'Products': JSON.stringify(Array.isArray(n.products) ? n.products.map(String) : ['quote'])
    }));
    log_(ctx, 'create_user', 'new=' + username);
    return { ok: true, username: username };
  });
}

function deleteUser_(body, ctx) {
  const deny = needMaster_(ctx); if (deny) return deny;
  return withLock_(function () {
    const t = table_(TAB.users, false);
    const i = findUserIdx_(t, body.target);
    if (i < 0) return { error: 'user not found' };
    const name = userName_(t, t.rows[i]);
    if (name.toLowerCase() === ctx.user.username.toLowerCase()) return { error: "you can't delete your own account" };
    if (roleOf_(t, t.rows[i]) === 'master' && !truthy_(cellGet_(t, t.rows[i], 'Locked')) && unlockedMasters_(t) <= 1) return { error: 'keep at least one unlocked master' };
    t.sh.deleteRow(i + 2);
    dropSessionsFor_('q', name, null);
    log_(ctx, 'delete_user', 'user=' + name);
    return { ok: true };
  });
}

function lockUser_(body, ctx) {   // legacy action (not called by today's client)
  const locked = body.locked === undefined ? true : !!truthy_(body.locked);
  return updateUser_({ target: body.target, updates: { locked: locked } }, ctx);
}

/* ───────────────────────────── activity (master) ───────────────────────────── */

function getActivity_(body, ctx) {
  const deny = needMaster_(ctx); if (deny) return deny;
  const limit = Math.max(1, Math.min(2000, Number(body.limit) || 200));
  const t = table_(TAB.activity, false);
  const rows = t.rows.slice(-limit).reverse();
  return { ok: true, activity: rows.map(function (r) {
    return { timestamp: iso_(cellGet_(t, r, 'Timestamp')), username: str_(cellGet_(t, r, 'Username')), role: str_(cellGet_(t, r, 'Role')),
      action: str_(cellGet_(t, r, 'Action')), detail: str_(cellGet_(t, r, 'Detail')), fingerprint: str_(cellGet_(t, r, 'DeviceFingerprint')),
      result: str_(cellGet_(t, r, 'Result')) };
  }) };
}
function clearActivity_(body, ctx) {
  const deny = needMaster_(ctx); if (deny) return deny;
  return withLock_(function () {
    const sh = sheet_(TAB.activity, true);
    const n = Math.max(0, sh.getLastRow() - 1);
    if (n > 0) sh.deleteRows(2, n);
    log_(ctx, 'clear_activity', 'cleared ' + n + ' rows');
    return { ok: true, cleared: n };
  });
}

/* ───────────────────────────── photos + tags ───────────────────────────── */

function photoMetaRows_() {
  const sh = sheet_(TAB.photos, false);
  if (!sh || sh.getLastRow() < 2) return { sh: sh, rows: [] };
  return { sh: sh, rows: sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues() };   // never loads DataChunk
}
function quotesVisibleTo_(ctx) {
  const res = getQuotes_({}, ctx);
  const ids = {};
  (res.quotes || []).forEach(function (q) { ids[String(q.id)] = true; });
  return ids;
}
function canSeePhoto_(ctx, uploader, quoteId, visibleIds) {
  if (!isStaffCtx_(ctx)) return true;
  if (String(uploader).toLowerCase() === ctx.user.username.toLowerCase()) return true;
  return !!(visibleIds && visibleIds[String(quoteId)]);
}
function validRef_(ref) { return /^[\w.:-]{1,80}$/.test(String(ref || '')); }

function savePhoto_(body, ctx) {
  if (ctx.user.role === 'admin') return { error: 'not allowed' };
  const p = body.photo || {};
  if (!validRef_(p.ref)) return { error: 'photo ref required' };
  const data = String(p.dataUrl || '');
  if (!/^data:image\//.test(data)) return { error: 'photo data required' };
  if (data.length > 8 * 1024 * 1024) return { error: 'photo too large' };
  const total = Math.ceil(data.length / PHOTO_CHUNK);
  return withLock_(function () {
    const sh = sheet_(TAB.photos, true);
    deletePhotoRows_(sh, p.ref);
    const rows = [];
    for (let i = 0; i < total; i++) {
      rows.push([String(p.ref), i, total, str_(p.quoteId, 80), ctx.user.username, Number(p.width) || '', Number(p.height) || '',
        JSON.stringify(Array.isArray(p.tags) ? p.tags.map(String) : []), str_(p.notes, 5000), p.customerVisible !== false,
        str_(p.createdAt, 40) || new Date().toISOString(), data.slice(i * PHOTO_CHUNK, (i + 1) * PHOTO_CHUNK)]);
    }
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 12).setValues(rows);
    log_(ctx, 'save_photo', 'ref=' + p.ref + ' quote=' + str_(p.quoteId, 80));
    return { ok: true, ref: String(p.ref), chunks: total };
  });
}
function deletePhotoRows_(sh, ref) {
  if (!sh || sh.getLastRow() < 2) return 0;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  let n = 0;
  for (let i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === String(ref)) { sh.deleteRow(i + 2); n++; }
  return n;
}
function getPhotosMeta_(body, ctx) {
  const m = photoMetaRows_();
  const visible = isStaffCtx_(ctx) ? quotesVisibleTo_(ctx) : null;
  const seen = {};
  const out = [];
  m.rows.forEach(function (r) {
    const ref = String(r[0]);
    if (!ref || seen[ref]) return;
    if (!canSeePhoto_(ctx, r[4], r[3], visible)) return;
    seen[ref] = true;
    out.push({ ref: ref, quoteId: String(r[3]), username: String(r[4]), width: Number(r[5]) || 0, height: Number(r[6]) || 0,
      tags: parseJson_(r[7], String(r[7] || '').split(',').map(function (s) { return s.trim(); }).filter(String)),
      notes: str_(r[8], 5000), customerVisible: !(r[9] === false || /^false$/i.test(String(r[9]))), createdAt: iso_(r[10]) });
  });
  return { ok: true, photos: out };
}
function getPhotoData_(body, ctx) {
  const sh = sheet_(TAB.photos, false);
  if (!sh || sh.getLastRow() < 2) return { error: 'photo not found' };
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  const parts = [];
  let meta = null;
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) !== String(body.ref)) continue;
    const r = sh.getRange(i + 2, 1, 1, 12).getValues()[0];
    meta = meta || r;
    parts.push([Number(r[1]) || 0, String(r[11] || '')]);
  }
  if (!meta) return { error: 'photo not found' };
  if (!canSeePhoto_(ctx, meta[4], meta[3], isStaffCtx_(ctx) ? quotesVisibleTo_(ctx) : null)) return { error: 'not allowed' };
  parts.sort(function (a, b) { return a[0] - b[0]; });
  return { ok: true, ref: String(body.ref), dataUrl: parts.map(function (p) { return p[1]; }).join('') };
}
function setPhotoTags_(body, ctx) {
  const tags = Array.isArray(body.tags) ? body.tags.map(function (s) { return str_(s, 60); }) : [];
  return withLock_(function () {
    const m = photoMetaRows_();
    const visible = isStaffCtx_(ctx) ? quotesVisibleTo_(ctx) : null;
    let n = 0;
    m.rows.forEach(function (r, i) {
      if (String(r[0]) !== String(body.ref)) return;
      if (!canSeePhoto_(ctx, r[4], r[3], visible)) return;
      m.sh.getRange(i + 2, 8).setValue(JSON.stringify(tags)); n++;
    });
    if (!n) return { error: 'photo not found' };
    log_(ctx, 'set_photo_tags', 'ref=' + body.ref + ' tags=' + tags.join(','));
    return { ok: true };
  });
}
function deletePhoto_(body, ctx) {
  if (ctx.user.role === 'admin') return { error: 'not allowed' };
  return withLock_(function () {
    const m = photoMetaRows_();
    const first = m.rows.filter(function (r) { return String(r[0]) === String(body.ref); })[0];
    if (!first) { log_(ctx, 'delete_photo', 'ref=' + body.ref + ' rows=0'); return { ok: true, deleted: 0 }; }
    if (isStaffCtx_(ctx) && String(first[4]).toLowerCase() !== ctx.user.username.toLowerCase()) return { error: 'not allowed' };
    const n = deletePhotoRows_(m.sh, body.ref);
    log_(ctx, 'delete_photo', 'ref=' + body.ref + ' rows=' + n);
    return { ok: true, deleted: n };
  });
}

function listTags_() {
  const t = table_(TAB.tags, false);
  return { ok: true, tags: t.rows.filter(function (r) { return String(cellGet_(t, r, 'TagName')).trim(); }).map(function (r) {
    return { name: String(cellGet_(t, r, 'TagName')).trim(), color: str_(cellGet_(t, r, 'Color')), createdBy: str_(cellGet_(t, r, 'CreatedBy')), createdAt: iso_(cellGet_(t, r, 'CreatedAt')) };
  }) };
}
function createTag_(body, ctx) {
  const deny = needMaster_(ctx); if (deny) return deny;
  const name = str_(body.name, 60).trim();
  if (!name) return { error: 'tag name required' };
  return withLock_(function () {
    const t = table_(TAB.tags, true);
    if (t.rows.some(function (r) { return String(cellGet_(t, r, 'TagName')).trim().toLowerCase() === name.toLowerCase(); })) return { error: 'tag already exists' };
    t.sh.appendRow(rowFromObj_(t, { 'TagName': name, 'Color': str_(body.color, 30), 'CreatedBy': ctx.user.username, 'CreatedAt': new Date().toISOString() }));
    log_(ctx, 'create_tag', 'tag=' + name);
    return { ok: true, name: name };
  });
}
function deleteTag_(body, ctx) {
  const deny = needMaster_(ctx); if (deny) return deny;
  const name = str_(body.name, 60).trim().toLowerCase();
  return withLock_(function () {
    const t = table_(TAB.tags, false);
    let n = 0;
    for (let i = t.rows.length - 1; i >= 0; i--) if (String(cellGet_(t, t.rows[i], 'TagName')).trim().toLowerCase() === name) { t.sh.deleteRow(i + 2); n++; }
    log_(ctx, 'delete_tag', 'tag=' + body.name);
    return { ok: true, deleted: n };
  });
}

/* ───────────────────────────── session actions ───────────────────────────── */

function whoami_(body, ctx) { return { ok: true, user: publicUser_(ctx.users, ctx.users.rows[ctx.userIdx]) }; }
function logout_(body) { dropSession_(body.token); return { ok: true }; }

const QUOTE_ACTIONS = {
  whoami: whoami_, logout: logout_,
  get_quotes: getQuotes_, save_quote: saveQuote_, delete_quote: deleteQuote_,
  set_status: setStatus_, change_status: setStatus_,                     // change_status = Timesheet bridge name
  complete_quote: function (b, c) { return setStatus_({ id: b.id, status: 'complete', timingHonest: b.timingHonest, overrunHours: b.overrunHours }, c); },
  uncomplete_quote: function (b, c) { return setStatus_({ id: b.id, status: 'in_progress' }, c); },
  get_invoices: getInvoices_,
  set_favourites: setFavourites_,
  get_users: getUsers_, update_user: updateUser_, create_user: createUser_, delete_user: deleteUser_, lock_user: lockUser_,
  get_activity: getActivity_, clear_activity: clearActivity_,
  save_photo: savePhoto_, get_photos_meta: getPhotosMeta_, get_photo_data: getPhotoData_, set_photo_tags: setPhotoTags_, delete_photo: deletePhoto_,
  list_tags: listTags_, create_tag: createTag_, delete_tag: deleteTag_
};
