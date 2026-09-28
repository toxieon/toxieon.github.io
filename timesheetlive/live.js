/* Timesheet Live — public, read-only view of Brandon's current week.
 *
 * Gate: same flow as Neill Quote — the passcode is SHA-256'd in the browser
 * and checked by an Apps Script backend (never shipped to the page). A good
 * code returns a short-lived session token; polling uses the token, so the
 * code isn't re-sent every refresh. No Google sign-in, no write access, no
 * editing controls: the backend only ever returns the sanitized week snapshot. */
(function () {
  'use strict';
  const cfg = window.TSL_CONFIG || {};
  const ENDPOINT = String(cfg.endpoint || '').trim();
  const POLL_MS = Math.max(20000, Number(cfg.pollMs) || 45000);
  const SESSION_KEY = 'tsl_session_v1';
  const REMEMBER_HOURS = 14;              // like Quote: stay unlocked for the working day
  const $ = (id) => document.getElementById(id);

  let session = loadSession();            // { token, codeHash, label }
  let snap = null, fetchedAt = 0, pollTimer = null, tickTimer = null, inflight = false, rendered = false, lastErr = '';

  /* ── helpers ── */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function localDate(iso) { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); }
  function isoDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function fmtDateHeader(d) { return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function fmtTime(hhmm, use24) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    if (use24) return `${pad2(h)}:${pad2(m)}`;
    return `${h % 12 === 0 ? 12 : h % 12}:${pad2(m)} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  function hhmmNow(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
  function hoursBetween(on, off) {
    const t = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + m; };
    let a = t(on), b = t(off); if (b < a) b += 1440; return Math.round(((b - a) / 60) * 100) / 100;
  }
  function h2(n) { return (Number(n) || 0).toFixed(2); }
  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function fingerprint() {   // same per-device key Quote uses, only for the backend rate limiter
    const KEY = 'nd_device_fp_v1';
    let fp = null; try { fp = localStorage.getItem(KEY); } catch (e) {}
    if (!fp) {
      fp = 'fp-' + Date.now().toString(36) + '-' + Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');
      try { localStorage.setItem(KEY, fp); } catch (e) {}
    }
    return fp;
  }
  function loadSession() {
    try {
      if (window.NDRemember) { const d = NDRemember.load(SESSION_KEY); return d && d.codeHash ? d : null; }
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return s && s.codeHash && Date.now() - s.at < REMEMBER_HOURS * 3600e3 ? s : null;
    } catch (e) { return null; }
  }
  function saveSession(s) {
    session = s;
    try {
      if (window.NDRemember) NDRemember.save(SESSION_KEY, s, REMEMBER_HOURS);
      else localStorage.setItem(SESSION_KEY, JSON.stringify(Object.assign({ at: Date.now() }, s)));
    } catch (e) {}
  }
  function clearSession() {
    session = null;
    try { if (window.NDRemember) NDRemember.clear(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }
  async function call(payload) {
    const r = await fetch(ENDPOINT, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, redirect: 'follow', cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  /* ── gate ── */
  function showLock(msg) {
    stopTimers();
    $('app').hidden = true; $('lock-screen').hidden = false;
    $('lock-err').textContent = msg || '';
    $('passcode-input').value = '';
    if (!('ontouchstart' in window)) setTimeout(() => $('passcode-input').focus(), 50);
  }
  function showApp() { $('lock-screen').hidden = true; $('app').hidden = false; }
  function setBusy(b) { $('passcode-submit').disabled = b; $('passcode-submit').textContent = b ? 'Checking…' : 'Unlock'; }
  function startCooldown(ms) {
    const until = Date.now() + ms; const inp = $('passcode-input'); const btn = $('passcode-submit');
    inp.disabled = true; btn.disabled = true;
    (function tick() {
      const left = until - Date.now();
      if (left <= 0) { inp.disabled = false; btn.disabled = false; $('lock-err').textContent = ''; return; }
      const s = Math.ceil(left / 1000);
      $('lock-err').textContent = '🔒 Too many attempts — try again in ' + (s < 60 ? s + 's' : Math.ceil(s / 60) + 'm');
      setTimeout(tick, 500);
    })();
  }
  async function login(codeHash, silent) {
    const data = await call({ action: 'tsl_login', codeHash, fingerprint: fingerprint() });
    if (data && data.ok && data.token) {
      saveSession({ token: data.token, codeHash, label: data.label || '' });
      applyFeed(data.feed); showApp(); schedulePoll();
      return { ok: true };
    }
    return { ok: false, data: data || {} };
  }
  async function onSubmit(e) {
    e.preventDefault();
    const code = $('passcode-input').value.trim().toLowerCase();   // case-insensitive, like the backend
    if (!code) return;
    $('lock-err').textContent = ''; setBusy(true);
    try {
      const res = await login(await sha256Hex(code), false);
      if (res.ok) return;
      const d = res.data;
      if (d.cooldownMs) { startCooldown(d.cooldownMs); $('passcode-input').value = ''; return; }
      let msg = d.error || 'Wrong passcode';
      if (typeof d.attemptsRemaining === 'number' && d.attemptsRemaining <= 3) msg += ` — ${d.attemptsRemaining} attempt${d.attemptsRemaining === 1 ? '' : 's'} left`;
      $('lock-err').textContent = msg; $('passcode-input').value = ''; $('passcode-input').focus();
    } catch (err) {
      $('lock-err').textContent = 'Can’t reach the server — check your connection.';
    } finally { setBusy(false); }
  }

  /* ── live refresh ── */
  function stopTimers() { clearTimeout(pollTimer); pollTimer = null; clearInterval(tickTimer); tickTimer = null; }
  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!session || document.hidden) return;   // paused while the tab is hidden
    pollTimer = setTimeout(refresh, POLL_MS);
    if (!tickTimer) tickTimer = setInterval(renderClockAndStatus, 20000);
  }
  async function refresh() {
    if (!session || inflight) return;
    inflight = true;
    try {
      const data = await call({ action: 'tsl_get', token: session.token });
      if (data && data.ok) { lastErr = ''; applyFeed(data.feed); }
      else if (data && data.reauth) {
        // token expired (6h) → silently re-unlock with the remembered code
        const res = await login(session.codeHash, true);
        if (!res.ok) { clearSession(); showLock(res.data.cooldownMs ? 'Too many attempts — try again shortly.' : 'Please enter your passcode again.'); }
      } else { lastErr = (data && data.error) || 'Update failed'; renderClockAndStatus(); }
    } catch (e) { lastErr = 'Offline — retrying'; renderClockAndStatus(); }
    finally { inflight = false; schedulePoll(); }
  }
  function applyFeed(feed) {
    fetchedAt = Date.now();
    snap = (feed && feed.snapshot) || null;
    render();
  }

  /* ── render (markup mirrors the timesheet History week view) ── */
  function tintClass(total, target, lowVis) {
    const st = total > target + 0.01 ? 'over' : (total < target - 0.01 ? 'under' : 'exact');
    return 'nd-tint nd-' + st + (lowVis ? ' nd-lowvis' : '');
  }
  function render() {
    const today = isoDate(new Date());
    const notice = $('notice');
    if (!snap) {
      $('live-title').textContent = 'Timesheet';
      $('wk-label').textContent = '—';
      notice.hidden = false;
      notice.textContent = 'Nothing has been published yet. It appears once Brandon opens the Timesheet app while signed in.';
      $('day-cards').innerHTML = '<div class="empty-week">No sessions this week.</div>';
      $('on-clock').hidden = true;
      ['wk-total', 'wk-ot'].forEach(id => { $(id).textContent = '0.00 hrs'; }); $('wk-days').textContent = '0';
      renderClockAndStatus(); return;
    }
    const disp = snap.display || {}; const use24 = disp.use24hr !== false;
    const first = (snap.owner || 'Brandon').split(/\s+/)[0];
    $('live-title').textContent = `${first}’s timesheet`;
    document.title = `${first}’s timesheet — Timesheet Live`;
    const ws = localDate(snap.weekStart), we = localDate(snap.weekEnd);
    $('wk-label').textContent = `${fmtDateHeader(ws)} – ${fmtDateHeader(we)}`;
    const stale = today > snap.weekEnd;
    $('wk-sub').textContent = stale ? 'Last published week' : 'This week';
    notice.hidden = !stale;
    if (stale) notice.textContent = 'Nothing has been logged for this week yet — showing the last published week.';
    const days = Array.isArray(snap.days) ? snap.days : [];
    const target = Number(disp.otThresholdDay) || 8;
    const html = days.map(d => {
      const dt = localDate(d.date);
      const rows = (d.rows || []).map(r => `<div class="session-row"><span class="sjob">${esc(r.job)}</span><span class="stime">${fmtTime(r.on, use24)} &rarr; ${fmtTime(r.off, use24)}</span><span class="shrs">${h2(r.hrs)} hrs</span></div>`).join('');
      const stat = (d.stat || []).map(r => `<div class="session-row"><span class="sjob">${esc(r.name)}${r.type ? `<span class="static-badge">${esc(r.type)}</span>` : ''}</span><span class="stime">${fmtTime(r.on, use24)} &rarr; ${fmtTime(r.off, use24)}</span><span class="shrs"></span></div>`).join('');
      const tint = (disp.interactiveTimes !== false && d.worked && d.total > 0.01) ? tintClass(d.total, target, disp.lowVisColours) : '';
      return `<div class="card day-card ${tint}${d.date === today ? ' is-today' : ''}" data-day="${esc(d.date)}"><div class="day-head"><span class="dname">${esc(d.dow)}</span><span class="ddate">${fmtDateHeader(dt)}</span></div>${rows}${stat}<div class="day-foot"><span>Total: ${h2(d.total)} hrs</span><span class="${d.ot > 0 ? 'ot-flag' : ''}">${d.ot > 0 ? 'OT ' + h2(d.ot) + ' hrs' : ''}</span></div></div>`;
    }).join('');
    const cards = $('day-cards');
    cards.classList.toggle('no-anim', rendered);   // animate the first paint only, not every refresh
    cards.innerHTML = html || '<div class="empty-week">No sessions this week.</div>';
    rendered = true;
    const t = snap.totals || {};
    $('wk-total').textContent = h2(t.total) + ' hrs';
    $('wk-ot').textContent = h2(t.ot) + ' hrs';
    $('wk-days').textContent = String(t.days || 0);
    renderClockAndStatus();
  }
  function renderClockAndStatus() {
    const el = $('on-clock');
    const oc = snap && snap.onClock;
    if (oc && oc.date && oc.on) {
      const use24 = !snap.display || snap.display.use24hr !== false;
      const since = localDate(oc.date); const [h, m] = oc.on.split(':').map(Number); since.setHours(h, m, 0, 0);
      const mins = Math.max(0, Math.floor((Date.now() - since.getTime()) / 60000));
      el.hidden = false;
      el.innerHTML = `<div><div class="oc-label">● On the clock</div><div class="oc-job">${esc(oc.job)}</div><div class="oc-time">since ${fmtTime(oc.onRounded || oc.on, use24)}</div></div><div class="oc-elapsed">${Math.floor(mins / 60)}h ${pad2(mins % 60)}m</div>`;
    } else { el.hidden = true; el.innerHTML = ''; }
    const dot = $('live-dot'); const upd = $('live-updated');
    if (!fetchedAt) { upd.textContent = 'Loading…'; return; }
    const age = Date.now() - fetchedAt;
    dot.className = 'live-dot' + (lastErr ? ' err' : (age > POLL_MS * 3 ? ' stale' : ''));
    let txt = 'Updated ' + hhmmNow(new Date(fetchedAt));
    if (snap && snap.generatedAt) {
      const g = new Date(snap.generatedAt);
      if (!isNaN(g)) txt += ' · last change ' + (isoDate(g) === isoDate(new Date()) ? hhmmNow(g) : g.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + hhmmNow(g));
    }
    if (lastErr) txt += ' · ' + lastErr;
    upd.textContent = txt;
  }

  /* ── boot ── */
  $('lock-form').addEventListener('submit', onSubmit);
  $('btn-lock').addEventListener('click', () => { clearSession(); snap = null; rendered = false; showLock(''); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(pollTimer); pollTimer = null; }
    else if (session && !$('app').hidden) refresh();   // immediate refresh on return
  });
  window.addEventListener('online', () => { if (session && !$('app').hidden) refresh(); });

  if (!ENDPOINT) {
    $('lock-sub').textContent = 'The live view isn’t connected yet.';
    $('passcode-input').disabled = true; $('passcode-submit').disabled = true;
    $('lock-err').textContent = '';
    return;
  }
  if (session && session.token) {
    // Remembered: show the shell straight away and fetch with the stored token.
    showApp(); renderClockAndStatus(); refresh();
  } else {
    showLock('');
  }
})();
