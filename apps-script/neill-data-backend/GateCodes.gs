/* Gate Codes — proximity view for anonymous users; full list for verified editors only.
 * Private spreadsheet tabs: gate_codes, gate_editors (see gcSetup_ in Admin). */

const GC_RADIUS_M = 150;
const GC_OWNER_EMAIL = 'brandon.j.neill@gmail.com';
const GC_VIEW_TTL_MS = 7 * 24 * 3600 * 1000;
const PROP_GC_PIN_HASH = 'GC_PIN_HASH';
const PROP_GC_PIN_ENABLED = 'GC_PIN_ENABLED';
const PROP_GC_APP_SLUG = 'GC_APP_SLUG';

const GC_ACTIONS = {
  gc_pin_status: gcPinStatus_,
  gc_pin_verify: gcPinVerify_,
  gc_pin_set: gcPinSet_,
  gc_nearby: gcNearby_,
  gc_list: gcList_,
  gc_upsert: gcUpsert_,
  gc_editors_list: gcEditorsList_,
  gc_editors_add: gcEditorsAdd_,
  gc_editors_remove: gcEditorsRemove_,
  gc_owner_app_link: gcOwnerAppLink_
};

function isGcAction_(action) { return !!GC_ACTIONS[action]; }
function routeGc_(body) { return GC_ACTIONS[String(body.action || '')](body); }

/* ── pure helpers (Node-tested) ───────────────────────────────────── */

function gcDistanceMetres_(lat1, lng1, lat2, lng2) {
  lat1 = parseFloat(lat1); lng1 = parseFloat(lng1); lat2 = parseFloat(lat2); lng2 = parseFloat(lng2);
  if ([lat1, lng1, lat2, lng2].some(function (v) { return v === null || v === undefined || Number.isNaN(v); })) return Infinity;
  const R = 6371000;
  const toRad = function (d) { return (d * Math.PI) / 180; };
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** At most one site: nearest row within radiusM. */
function gcNearestSiteWithin_(sites, lat, lng, radiusM) {
  let best = null;
  let bestDist = Infinity;
  (sites || []).forEach(function (s) {
    if (s.lat == null || s.lng == null) return;
    const d = gcDistanceMetres_(lat, lng, s.lat, s.lng);
    if (d <= radiusM && d < bestDist) { best = s; bestDist = d; }
  });
  return best ? { site: best, dist: bestDist } : null;
}

function gcValidateCode_(code) {
  const s = String(code == null ? '' : code).trim();
  if (!/^\d{4}$/.test(s)) return 'Gate code must be exactly 4 digits';
  return '';
}

/** Public shape for a single site (never log the code). */
function gcPublicSite_(row) {
  if (!row) return null;
  return { site_id: row.site_id, site_name: row.site_name, code: row.code };
}

function gcListPolicy_(isEditor, sites, lat, lng, radiusM) {
  if (isEditor) return { mode: 'full', codes: sites.map(gcPublicSite_) };
  const hit = gcNearestSiteWithin_(sites, lat, lng, radiusM);
  return { mode: 'proximity', site: hit ? gcPublicSite_(hit.site) : null };
}

/* ── sheets ───────────────────────────────────────────────────────── */

function gcCodesSheet_() {
  return privateTab_('gate_codes', ['site_id', 'site_name', 'lat', 'lng', 'code', 'updatedBy', 'updatedAt']);
}
function gcEditorsSheet_() {
  return privateTab_('gate_editors', ['email', 'role', 'addedAt', 'addedBy']);
}
function gcReadSites_() {
  const sh = gcCodesSheet_();
  const values = sh.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const lat = parseFloat(r[2]); const lng = parseFloat(r[3]);
    if (!r[0]) continue;
    out.push({
      site_id: String(r[0]),
      site_name: String(r[1] || ''),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      code: String(r[4] || ''),
      updatedBy: String(r[5] || ''),
      updatedAt: r[6]
    });
  }
  return out;
}
function gcWriteSiteRow_(sh, rowIndex, row) {
  sh.getRange(rowIndex, 1, 1, 7).setValues([[
    plainCell_(row.site_id),
    plainCell_(row.site_name),
    row.lat,
    row.lng,
    plainCell_(row.code),
    plainCell_(row.updatedBy),
    row.updatedAt || new Date()
  ]]);
}
function gcFindSiteRowIndex_(sh, siteId) {
  const values = sh.getDataRange().getValues();
  const want = String(siteId).toLowerCase();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === want) return i + 1;
  }
  return -1;
}

function gcSeedEditors_() {
  const sh = gcEditorsSheet_();
  const values = sh.getDataRange().getValues();
  let hasOwner = false;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === GC_OWNER_EMAIL) hasOwner = true;
  }
  if (!hasOwner) sh.appendRow([GC_OWNER_EMAIL, 'owner', new Date(), 'setup']);
}

function gcSetup_() {
  gcCodesSheet_();
  gcEditorsSheet_();
  gcSeedEditors_();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP_GC_PIN_ENABLED) === null) props.setProperty(PROP_GC_PIN_ENABLED, 'true');
  return 'Gate Codes sheets ready (gate_codes, gate_editors). Set GC_APP_SLUG to your secret folder name.';
}

/* ── PIN ──────────────────────────────────────────────────────────── */

function gcPinEnabled_() {
  const v = PropertiesService.getScriptProperties().getProperty(PROP_GC_PIN_ENABLED);
  if (v === null || v === '') return true;
  return truthy_(v);
}
function gcPinConfigured_() {
  return !!PropertiesService.getScriptProperties().getProperty(PROP_GC_PIN_HASH);
}
function gcPinStatus_() {
  return {
    ok: true,
    pinRequired: gcPinEnabled_(),
    pinConfigured: gcPinConfigured_()
  };
}
function gcRequireViewSession_(body) {
  if (!gcPinEnabled_()) return null;
  const tok = String(body.viewSession || '');
  const s = getSession_('gc_view', tok);
  if (!s) return { ok: false, error: 'pin_required' };
  return null;
}
function gcPinVerify_(body) {
  const pin = String(body.pin == null ? '' : body.pin).trim();
  if (!/^\d{4,12}$/.test(pin)) return { ok: false, error: 'invalid pin' };
  const stored = PropertiesService.getScriptProperties().getProperty(PROP_GC_PIN_HASH);
  if (!stored) return { ok: false, error: 'pin_not_configured' };
  const pepper = pepper_();
  const v2 = credFromCode_(pin, pepper);
  const settled = settleLogin_('gc_pin', '', credMatch_(stored, sha256Hex_(pin), v2) ? 'ok' : 'fail');
  if (settled) return settled;
  const session = newSession_('gc_view', 'viewer', GC_VIEW_TTL_MS);
  return { ok: true, viewSession: session, ttlMs: GC_VIEW_TTL_MS };
}
function gcPinSet_(body) {
  const owner = gcAuthOwner_(body);
  if (!owner) return { ok: false, error: 'forbidden' };
  if (body.disable === true) {
    PropertiesService.getScriptProperties().setProperty(PROP_GC_PIN_ENABLED, 'false');
    return { ok: true, pinRequired: false };
  }
  if (body.enable === true) {
    PropertiesService.getScriptProperties().setProperty(PROP_GC_PIN_ENABLED, 'true');
  }
  const pin = String(body.pin == null ? '' : body.pin).trim();
  if (pin) {
    if (!/^\d{4,12}$/.test(pin)) return { ok: false, error: 'pin must be 4–12 digits' };
    PropertiesService.getScriptProperties().setProperty(PROP_GC_PIN_HASH, credFromCode_(pin, pepper_()));
    PropertiesService.getScriptProperties().setProperty(PROP_GC_PIN_ENABLED, 'true');
  }
  return { ok: true, pinRequired: gcPinEnabled_(), pinConfigured: gcPinConfigured_() };
}

/* ── Google auth (editors) ────────────────────────────────────────── */

function gcVerifyAccessToken_(token) {
  token = String(token || '').trim();
  if (!token) return null;
  const r = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) return null;
  let p;
  try { p = JSON.parse(r.getContentText()); } catch (e) { return null; }
  if (!p.email || !p.email_verified) return null;
  return { email: String(p.email).toLowerCase(), sub: p.sub, name: p.name || '' };
}
function gcVerifyIdToken_(idToken) {
  idToken = String(idToken || '').trim();
  if (!idToken) return null;
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  let p;
  try { p = JSON.parse(r.getContentText()); } catch (e) { return null; }
  if (!p.email || String(p.email_verified) !== 'true') return null;
  return { email: String(p.email).toLowerCase(), sub: p.sub, name: p.name || '' };
}
function gcAuthProfile_(body) {
  return gcVerifyAccessToken_(body.accessToken) || gcVerifyIdToken_(body.idToken || body.googleIdToken);
}
function gcIsEditorEmail_(email) {
  email = String(email || '').toLowerCase();
  if (email === GC_OWNER_EMAIL) return true;
  const sh = gcEditorsSheet_();
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const em = String(values[i][0]).toLowerCase();
    const role = String(values[i][1] || '').toLowerCase();
    if (em === email && (role === 'editor' || role === 'owner')) return true;
  }
  return false;
}
function gcAuthEditor_(body) {
  const profile = gcAuthProfile_(body);
  if (!profile) return null;
  if (!gcIsEditorEmail_(profile.email)) return null;
  return profile;
}
function gcAuthOwner_(body) {
  const profile = gcAuthProfile_(body);
  if (!profile || profile.email !== GC_OWNER_EMAIL) return null;
  return profile;
}

/* ── actions ──────────────────────────────────────────────────────── */

function gcNearby_(body) {
  const pinGate = gcRequireViewSession_(body);
  if (pinGate) return pinGate;
  const lat = parseFloat(body.lat);
  const lng = parseFloat(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: 'lat/lng required' };
  const sites = gcReadSites_();
  const hit = gcNearestSiteWithin_(sites, lat, lng, GC_RADIUS_M);
  return { ok: true, site: hit ? gcPublicSite_(hit.site) : null };
}

function gcList_(body) {
  const editor = gcAuthEditor_(body);
  if (!editor) return { ok: false, error: 'forbidden' };
  const sites = gcReadSites_();
  return { ok: true, editor: true, codes: sites.map(gcPublicSite_) };
}

function gcUpsert_(body) {
  const editor = gcAuthEditor_(body);
  if (!editor) return { ok: false, error: 'forbidden' };
  const bad = gcValidateCode_(body.code);
  if (bad) return { ok: false, error: bad };
  const code = String(body.code).trim();
  const sh = gcCodesSheet_();
  const now = new Date();
  let siteId = String(body.site_id || '').trim();
  const lat = parseFloat(body.lat);
  const lng = parseFloat(body.lng);
  const sites = gcReadSites_();

  if (siteId) {
    const idx = gcFindSiteRowIndex_(sh, siteId);
    const row = {
      site_id: siteId,
      site_name: str_(body.site_name, 200) || (function () {
        const ex = sites.find(function (s) { return s.site_id === siteId; });
        return ex ? ex.site_name : '';
      }()) || 'Site',
      lat: Number.isFinite(lat) ? lat : (function () {
        const ex = sites.find(function (s) { return s.site_id === siteId; });
        return ex ? ex.lat : null;
      }()),
      lng: Number.isFinite(lng) ? lng : (function () {
        const ex = sites.find(function (s) { return s.site_id === siteId; });
        return ex ? ex.lng : null;
      }()),
      code: code,
      updatedBy: editor.email,
      updatedAt: now
    };
    if (idx > 0) gcWriteSiteRow_(sh, idx, row);
    else gcWriteSiteRow_(sh, sh.getLastRow() + 1, row);
    return { ok: true, row: gcPublicSite_(row) };
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: 'lat/lng required' };

  const hints = Array.isArray(body.jobHints) ? body.jobHints : [];
  let hintHit = null;
  let hintDist = Infinity;
  hints.forEach(function (h) {
    if (!h || h.lat == null || h.lng == null) return;
    const d = gcDistanceMetres_(lat, lng, h.lat, h.lng);
    if (d <= GC_RADIUS_M && d < hintDist) { hintHit = h; hintDist = d; }
  });
  if (hintHit && hintHit.job_id) {
    siteId = String(hintHit.job_id);
  }

  const near = gcNearestSiteWithin_(sites, lat, lng, GC_RADIUS_M);
  if (!siteId && near) siteId = near.site.site_id;

  if (!siteId) siteId = randomHex_(16);

  const existingIdx = gcFindSiteRowIndex_(sh, siteId);
  const row = {
    site_id: siteId,
    site_name: str_(body.site_name, 200) || (hintHit && hintHit.job_name) || (near && near.site.site_name) || 'Site',
    lat: lat,
    lng: lng,
    code: code,
    updatedBy: editor.email,
    updatedAt: now
  };
  if (existingIdx > 0) gcWriteSiteRow_(sh, existingIdx, row);
  else sh.appendRow([row.site_id, row.site_name, row.lat, row.lng, row.code, row.updatedBy, row.updatedAt]);
  return { ok: true, row: gcPublicSite_(row) };
}

function gcEditorsList_(body) {
  const editor = gcAuthEditor_(body);
  if (!editor) return { ok: false, error: 'forbidden' };
  const sh = gcEditorsSheet_();
  const values = sh.getDataRange().getValues();
  const editors = [];
  for (let i = 1; i < values.length; i++) {
    const em = String(values[i][0] || '');
    if (!em) continue;
    editors.push({ email: em, role: String(values[i][1] || 'editor') });
  }
  return { ok: true, owner: GC_OWNER_EMAIL, editors: editors, isOwner: editor.email === GC_OWNER_EMAIL };
}

function gcEditorsAdd_(body) {
  const owner = gcAuthOwner_(body);
  if (!owner) return { ok: false, error: 'forbidden' };
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'invalid email' };
  if (email === GC_OWNER_EMAIL) return { ok: false, error: 'owner is fixed' };
  const sh = gcEditorsSheet_();
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === email) return { ok: true, already: true };
  }
  sh.appendRow([email, 'editor', new Date(), owner.email]);
  return { ok: true };
}

function gcEditorsRemove_(body) {
  const owner = gcAuthOwner_(body);
  if (!owner) return { ok: false, error: 'forbidden' };
  const email = String(body.email || '').trim().toLowerCase();
  const sh = gcEditorsSheet_();
  const values = sh.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]).toLowerCase() === email && String(values[i][1]).toLowerCase() !== 'owner') {
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'not found' };
}

function gcOwnerAppLink_(body) {
  const profile = gcAuthProfile_(body);
  if (!profile || profile.email !== GC_OWNER_EMAIL) return { ok: false, error: 'forbidden' };
  const slug = PropertiesService.getScriptProperties().getProperty(PROP_GC_APP_SLUG);
  if (!slug) return { ok: false, error: 'not_configured' };
  return {
    ok: true,
    app: { id: 'gatecodes', name: 'Gate Codes', path: '/' + slug + '/', icon: '/favicon.svg', color: '#6ddba3', order: 50 }
  };
}
