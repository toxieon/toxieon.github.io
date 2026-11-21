/* Owner Black Book (/blackbook/). Ported from tipdash's owner page onto the Neill Data site.
 *
 * Owner only. Every byte of book data is read live from TipBot (/api/owner/blackbook*) with a Bearer token.
 * Nothing is committed, cached to disk or stored in Drive. Signed out shows only the gate. A signed-in
 * non-owner gets 404 from the API and sees a "not the owner" message. The API is the real gate.
 *
 * Prices, price history, model numbers and Model sees more are not stored yet. The API returns
 * {status:"coming_soon"} for them and this page says Coming soon. It never invents a value.
 * Times are Australia/Melbourne. Prices are AUD decimal ($4.20).
 */
(function (root) {
  "use strict";
  var APP_VERSION = "0.2.1";
  var F = root.BBFormat, D = root.BBDates, A = root.BBApi, DEMO = root.BBDemo;
  var esc = F.esc, fmtPrice = F.fmtPrice, ordinal = F.ordinal, initials = F.initials, resultText = F.resultText, resultClass = F.resultClass;
  var isComingSoon = F.isComingSoon, prioOf = F.prioOf, priceInput = F.priceInput, highlight = F.highlight;
  var PRIO = F.PRIO, TIER_DEFAULTS = F.TIER_DEFAULTS, DISCLAIMER = F.DISCLAIMER, HELPLINE = F.HELPLINE;
  var toDate = D.toDate, parts = D.parts, tzName = D.tzName, fmtTime = D.fmtTime, fmtClock = D.fmtClock, dayKey = D.dayKey, fmtDay = D.fmtDay,
    fmtIsoDay = D.fmtIsoDay, pad2 = D.pad2, relIn = D.relIn, countdown = D.countdown, JUMP_SOON_MIN = D.JUMP_SOON_MIN;
  if (typeof document === "undefined" || !document.getElementById("bb-app")) return;

  // ── icons ───────────────────────────────────────────────────────────
  var IC = {
    home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z",
    flag: "M5 21V4m0 0h11l-2 4 2 4H5",
    pulse: "M3 12h4l2-5 4 10 2-5h6",
    book: "M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zm0 14a2 2 0 0 1 2-2h11",
    clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    archive: "M4 5h16v4H4zm1 4v10h14V9M10 13h4",
    gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm7.4 3a7.4 7.4 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L15 3h-4l-.3 2.6a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1L11 21h4l.3-2.6a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1z",
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0",
    plus: "M12 5v14M5 12h14",
    check: "M5 12.5 10 17l9-10",
    x: "M6 6l12 12M18 6 6 18",
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4-4",
    key: "M15 7a4 4 0 1 1-3.9 5H7v3H5v-3H3v-2h8.1A4 4 0 0 1 15 7z",
    bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zm4 3a2 2 0 0 0 4 0",
    sort: "M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3",
    chev: "M9 6l6 6-6 6",
    back: "M15 6l-6 6 6 6",
    trend: "M3 17l6-6 4 4 8-8",
    alert: "M12 4 2 20h20zM12 10v4m0 3v.5",
    diamond: "M12 3l9 9-9 9-9-9z"
  };
  function svg(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + IC[name] + '"></path></svg>'; }
  function bars(n) {
    return '<span class="bars" aria-hidden="true"><i class="' + (n >= 1 ? "on" : "") + '"></i><i class="' + (n >= 2 ? "on" : "") + '"></i><i class="' + (n >= 3 ? "on" : "") + '"></i></span>';
  }
  function badge(key, lg) {
    var p = PRIO[key] || PRIO.low;
    return '<span class="badge ' + key + (lg ? " lg" : "") + '">' + bars(p.bars) + p.label + "</span>";
  }
  function ownerChip(label) { return '<span class="chip-owner">' + svg("key") + esc(label || "Owner") + "</span>"; }
  function mono(entry, lg, silk) {
    var key = prioOf(entry);
    var url = F.silkUrl(silk);
    var ini = initials(entry.horse_name || entry.horseName);
    var inner = url ? '<img src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer" data-ini="' + esc(ini) + '">' : esc(ini);
    return '<span class="mono ' + key + (lg ? " lg" : "") + '" aria-hidden="true">' + inner + "</span>";
  }

  // ── session and API (Bearer only; live data, demo only on localhost ?demo=1) ──
  var demoMode = DEMO.isDemoMode(location.hostname, location.search);
  var demoBackend = demoMode ? DEMO.createBackend() : null;
  function token() { return demoMode ? "demo-local" : A.readToken(root.localStorage); }

  async function call(method, path, body) {
    var res = demoBackend ? demoBackend.request(method, path, body) : await A.request(method, path, body, { token: token() });
    if (res.auth === "signin") { A.clearToken(root.localStorage); S.auth = "signin"; S.gateMsg = "Your session has expired. Sign in with Discord again."; render(); }
    else if (res.auth === "denied") { S.auth = "denied"; render(); }
    return { status: res.status, data: res.data };
  }
  function signOut() {
    A.clearToken(root.localStorage);
    S.auth = "signin"; S.gateMsg = ""; S.book = null; S.upcoming = null; S.detail = {};
    render();
  }

  // ── state ──────────────────────────────────────────────────────────
  var S = {
    auth: token() ? "checking" : "signin",
    book: null, upcoming: null, detail: {}, loading: false, error: "",
    prio: "all", filter: "", sort: "nextJump", upFilter: "all",
    skew: 0, add: null, toast: "", gateMsg: ""
  };
  function now() { return Date.now() + S.skew; }
  function noteServer(data) {
    var d = toDate(data && data.serverNow);
    if (d) S.skew = d.getTime() - Date.now();
  }
  function route() {
    var h = (location.hash || "").replace(/^#/, "");
    var m;
    if ((m = h.match(/^\/horse\/(\d+)/))) return { view: "horse", id: m[1] };
    if (/^\/upcoming/.test(h)) return { view: "upcoming" };
    if (/^\/archived/.test(h)) return { view: "list", archived: true };
    if (/^\/add/.test(h)) return { view: "list", add: /^\/add\/race/.test(h) ? "race" : "search" };
    return { view: "list" };
  }

  async function loadBook() {
    var r = route();
    S.loading = true;
    var res = await call("GET", A.paths.list({ priority: S.prio, filter: r.archived ? "archived" : S.filter, sort: S.sort }));
    S.loading = false;
    if (res.status === 200 && res.data.ok) { S.auth = "ok"; S.error = ""; S.book = res.data; noteServer(res.data); }
    else if (res.status !== 401 && !(res.status === 404)) S.error = "The Black Book did not load. Try again in a moment.";
    render();
  }
  async function loadUpcoming() {
    S.loading = true;
    var res = await call("GET", A.paths.upcoming());
    S.loading = false;
    if (res.status === 200 && res.data.ok) { S.auth = "ok"; S.error = ""; S.upcoming = res.data; noteServer(res.data); }
    else if (res.status !== 401 && res.status !== 404) S.error = "Upcoming runs did not load. Try again in a moment.";
    render();
  }
  async function loadDetail(id) {
    S.loading = true;
    var res = await call("GET", A.paths.entry(id));
    S.loading = false;
    if (res.status === 200 && res.data.ok) { S.auth = "ok"; S.error = ""; S.detail[id] = res.data; noteServer(res.data); }
    else if (res.status === 404 && res.data.code === "missing") { S.auth = "ok"; S.detail[id] = { missing: true }; }
    else if (res.status !== 401 && res.status !== 404) S.error = "This horse did not load. Try again in a moment.";
    render();
  }
  function load() {
    var r = route();
    if (!token()) { S.auth = "signin"; render(); return; }
    if (r.view === "upcoming") return loadUpcoming();
    if (r.view === "horse") return loadDetail(r.id);
    return loadBook();
  }

  // ── chrome ─────────────────────────────────────────────────────────
  var app = document.getElementById("bb-app");
  var modalRoot = document.createElement("div");
  modalRoot.id = "bb-modal";
  document.body.appendChild(modalRoot);

  function legal() {
    return '<footer class="legal"><b>' + DISCLAIMER + "</b><span>" + HELPLINE.replace("1800 858 858", "<b>1800 858 858</b>") +
      "</span><span>Times are " + esc(tzName()) + " (Melbourne). Prices are AUD decimal.</span></footer>";
  }
  function shell(active, title, body) {
    var nav = [
      ["#/", "book", "Black Book", "list"],
      ["#/upcoming", "clock", "Upcoming runs", "upcoming"],
      ["#/archived", "archive", "Archived", "archived"]
    ];
    var side = '<aside class="bb-side"><a class="bb-logo" href="/hub/"><i>//</i><span><b>Black Book</b><small>Neill Data</small></span></a><nav class="bb-nav" aria-label="Black Book">' +
      '<a href="/hub/" class="hub-link">' + svg("back") + "<span>Back to Hub</span></a><hr>" +
      nav.map(function (n) {
        return '<a href="' + n[0] + '"' + (n[3] === active ? ' aria-current="page"' : "") + ' title="' + n[2] + '">' + svg(n[1]) + "<span>" + n[2] + "</span>" +
          (n[3] === "upcoming" ? '<span class="owner">' + ownerChip() + "</span>" : "") + "</a>";
      }).join("") +
      '<hr><a href="#/" data-act="signout" title="Sign out">' + svg("x") + "<span>Sign out</span></a></nav>" +
      '<div class="bb-side-foot">' + DISCLAIMER + "<br>" + HELPLINE + "</div></aside>";
    var mtop = '<header class="bb-mtop"><a class="iconbtn hub-link" href="/hub/" aria-label="Back to Hub">' + svg("back") + "</a><h2>" + esc(title) + "</h2>" +
      '<a class="iconbtn" href="#/add" aria-label="Add horse">' + svg("plus") + "</a></header>";
    var tabs = [
      ["/hub/", "back", "Hub", ""], ["#/", "book", "Black Book", "list"],
      ["#/upcoming", "clock", "Runs", "upcoming"], ["#/", "x", "Sign out", "out"]
    ];
    var tabbar = '<nav class="bb-tabs" aria-label="Sections">' + tabs.map(function (t) {
      var cur = t[3] && t[3] !== "out" && (t[3] === active || (t[3] === "list" && active === "archived"));
      return '<a href="' + t[0] + '"' + (t[3] === "out" ? ' data-act="signout"' : "") + (cur ? ' aria-current="page"' : "") + ">" + svg(t[1]) + "<span>" + t[2] + "</span></a>";
    }).join("") + "</nav>";
    var top = '<div class="bb-topbar"><span class="spacer"></span>' + (demoMode ? '<span class="chip-soon">Demo data</span>' : "") + ownerChip("Owner view") + "</div>";
    return '<div class="bb-shell">' + side + '<div class="bb-col">' + mtop + '<main class="bb-main"><div class="bb-wrap">' + top +
      (S.error ? '<div class="banner" role="status">' + esc(S.error) + "</div>" : "") + body + legal() + "</div></main></div></div>" + tabbar;
  }
  function bare(body) { return '<main class="bb-main"><div class="bb-wrap" style="max-width:560px;padding-top:12vh">' + body + '<p style="margin-top:18px"><a class="btn hub-link" href="/hub/">Back to Hub</a></p></div></main>'; }
  function gateHtml() {
    var href = esc(A.loginUrl(location.origin));
    var msg = S.gateMsg ? '<p class="muted small" role="alert" id="bb-gate-msg">' + esc(S.gateMsg) + "</p>" : "";
    return '<div class="msg"><h2>Black Book</h2><p>Sign in with Discord to open your Black Book. This page is for the owner only.</p>' +
      msg +
      '<p><a class="btn primary" id="bb-discord" href="' + href + '">Sign in with Discord</a></p></div>';
  }

  // ── shared pieces ─────────────────────────────────────────────────
  function ringHtml(iso, small) {
    var d = toDate(iso);
    if (!d) return "";
    var c = countdown(d.getTime(), now());
    if (c.kind === "jumped") return '<span class="glyph" data-jump="' + esc(iso) + '"' + (small ? ' data-sm="1"' : "") + ' title="Awaiting result">' + svg("clock") + "</span>";
    if (c.kind === "date") {
      var p = parts(d, { weekday: "short", day: "numeric", month: "short" });
      return '<span class="dtile" data-jump="' + esc(iso) + '"' + (small ? ' data-sm="1"' : "") + "><small>" + esc(p.weekday) + "</small>" + esc(p.day + " " + p.month) + "</span>";
    }
    var size = small ? 58 : 72;
    var r = size / 2 - 4;
    var circ = 2 * Math.PI * r;
    return '<span class="ring' + (small ? " sm" : "") + (c.soon ? " soon" : "") + '" data-jump="' + esc(iso) + '"' + (small ? ' data-sm="1"' : "") +
      ' role="timer" aria-label="Jumps in ' + esc(c.text) + '"><svg viewBox="0 0 ' + size + " " + size + '" aria-hidden="true"><circle class="bg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r +
      '"></circle><circle class="fg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + (circ * (1 - c.frac)).toFixed(1) +
      '"></circle></svg><b>' + esc(c.text) + "</b></span>";
  }
  function hasNext(nx) { return !!(nx && (nx.state || nx.jump_at)); }
  function pendingTag(e) { return e && e.pending ? ' <span class="tag pending" title="Saved by name. It is matched to a horse once it races.">Pending match</span>' : ""; }
  function raceLine(nx) {
    if (!nx) return "";
    return esc((nx.meeting || "Race") + (nx.race_no ? " · R" + nx.race_no : ""));
  }
  function raceDetail(nx) {
    var bits = [];
    var d = toDate(nx.jump_at);
    if (nx.distance_m) bits.push(nx.distance_m + "m");
    if (d) bits.push(fmtTime(d) + " " + tzName(d));
    if (nx.barrier) bits.push("Barrier " + nx.barrier);
    if (nx.runner_no) bits.push("No. " + nx.runner_no);
    if (nx.field_size) bits.push(nx.field_size + " runners");
    return esc(bits.join(" · "));
  }
  function isSoon(nx) {
    var d = nx && nx.state === "upcoming" && toDate(nx.jump_at);
    if (!d) return false;
    var diff = d.getTime() - now();
    return diff > 0 && diff <= JUMP_SOON_MIN * 60000;
  }
  function nextPanel(nx) {
    if (!hasNext(nx)) {
      return '<div class="nextp none"><div class="t"><span class="bb-cap">Next start <span class="tag">Not entered</span></span><b>No entry on file</b>' +
        '<span class="d">A start shows here once its race is on file.</span></div><span class="glyph dash">' + svg("flag") + "</span></div>";
    }
    if (nx.state === "scratched") {
      return '<div class="nextp scr"><div class="t"><span class="bb-cap">Next start <span class="tag red">Scratched</span></span><b>' + raceLine(nx) + "</b>" +
        '<span class="d">' + raceDetail(nx) + '</span></div><span class="glyph red">' + svg("x") + "</span></div>";
    }
    var d = toDate(nx.jump_at);
    if (nx.state === "jumped" || (d && d.getTime() <= now())) {
      return '<div class="nextp"><div class="t"><span class="bb-cap">Next start <span class="tag">Jumped</span></span><b>' + raceLine(nx) + "</b>" +
        '<span class="d">Jumped ' + (d ? esc(fmtTime(d) + " " + tzName(d)) : "") + " · awaiting result</span></div>" + ringHtml(nx.jump_at) + "</div>";
    }
    var soon = isSoon(nx);
    return '<div class="nextp' + (soon ? " soon" : "") + '"><div class="t"><span class="bb-cap"><i class="live"></i>Next start' + (soon ? ' <span class="tag amber">Jump soon</span>' : "") +
      "</span><b>" + raceLine(nx) + '</b><span class="d">' + raceDetail(nx) + "</span></div>" + ringHtml(nx.jump_at) + "</div>";
  }
  function pricePanel(e) {
    var got = fmtPrice(e.bet_price);
    var shown = isComingSoon(e.price);
    return '<div class="pricep"><span class="bb-cap">Price now</span><div class="now"><strong aria-hidden="true">—</strong>' +
      (shown ? '<span class="chip-soon">Coming soon</span>' : "") + "</div>" + (got ? '<span class="got">You got <b>' + got + "</b></span>" : "") + "</div>";
  }
  function lastLine(run, label) {
    if (!run) return '<span class="bb-cap">' + (label || "Last") + '</span><span>No run on file</span>';
    var bits = [];
    if (run.margin) bits.push(run.margin);
    if (run.meeting) bits.push(run.meeting);
    if (run.race_date) bits.push(fmtIsoDay(run.race_date));
    var res = resultText(run);
    return '<span class="bb-cap">' + (label || "Last") + "</span>" + (res ? '<span class="res ' + resultClass(run) + '">' + esc(res) + "</span>" : "") +
      "<span>" + esc(bits.join(" · ")) + "</span>";
  }
  function pedigree(e) {
    var bits = [];
    if (e.sire) bits.push("By " + e.sire);
    if (e.dam) bits.push("out of " + e.dam);
    return bits.join(" ");
  }

  // ── list ───────────────────────────────────────────────────────────
  function card(e, archived) {
    var key = prioOf(e);
    var soon = isSoon(e.next);
    var meta = pedigree(e);
    var inner = '<div class="chead">' + mono(e) + '<div class="who"><h3 class="hname">' + esc(e.horse_name) + "</h3>" + pendingTag(e) +
      (meta ? '<div class="hmeta">' + esc(meta) + "</div>" : "") + "</div>" + badge(key) + "</div>" +
      (e.note ? '<p class="note">' + esc(e.note) + "</p>" : '<p class="note empty">No note yet.</p>') +
      nextPanel(e.next) + pricePanel(e) + '<div class="cfoot">' + lastLine(e.last_result) + "</div>";
    if (archived) {
      var when = toDate(e.archived_at);
      return '<div class="card ' + key + '">' + inner + '<div class="card-actions"><button class="btn primary" type="button" data-act="restore" data-id="' + esc(e.id) +
        '">Restore</button><a class="btn" href="#/horse/' + esc(e.id) + '">Open</a></div><span class="muted small">Archived ' + (when ? esc(fmtDay(when)) : "") +
        " after 120 days with no run.</span></div>";
    }
    return '<a class="card ' + key + (soon ? " soon" : "") + '" href="#/horse/' + esc(e.id) + '" aria-label="' + esc(e.horse_name) + ", " + PRIO[key].label + ' priority">' + inner + "</a>";
  }
  function emptyState() {
    var art = '<svg width="230" height="200" viewBox="0 0 230 200" aria-hidden="true"><ellipse cx="115" cy="186" rx="80" ry="8" fill="#05070B"/>' +
      '<path d="M30 34q42-10 85 6v130q-43-16-85-6z" fill="#121722" stroke="#2A3142" stroke-width="3"/><path d="M200 34q-42-10-85 6v130q43-16 85-6z" fill="#121722" stroke="#2A3142" stroke-width="3"/>' +
      '<path d="M46 62q26-6 52 2M46 80q26-6 52 2M46 98q26-6 52 2" stroke="#2A3142" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M160 22h22v62l-11-10-11 10z" fill="#F5C542"/><circle cx="170" cy="128" r="26" fill="#5B8CFF"/><path d="M170 116v24M158 128h24" stroke="#07090F" stroke-width="5" stroke-linecap="round"/></svg>';
    return '<section class="empty">' + art + "<h2>Your Black Book is empty</h2><p>Follow the horses you care about. Their next start and how they ran show here. " +
      "Add one from a race card or search by name.</p>" +
      '<div class="row"><a class="btn primary" href="#/add">' + svg("search") + 'Search for a horse</a><a class="btn" href="#/add/race">' + svg("flag") + "Add from a race card</a></div>" +
      '<div class="legend">' + badge("high") + "<span>Every alert + Discord DM</span>" + badge("med") + "<span>Key alerts</span>" + badge("low") + "<span>Results only</span></div></section>";
  }
  function listView() {
    var r = route();
    var b = S.book;
    var active = r.archived ? "archived" : "list";
    var head = '<div class="bb-head"><div><h1 class="bb-h1">' + (r.archived ? "Archived" : "Black Book") + '</h1><p class="bb-sub">' +
      (r.archived ? "Horses with no run for 120 days. One tap brings a horse back." : (b && !b.counts.horses && !b.archived_count ? "Nothing here yet." : "The horses you follow. Next starts and results in one place.")) +
      '</p></div><a class="btn primary" href="#/add">' + svg("plus") + "Add horse</a></div>";
    if (!b) return shell(active, "Black Book", head + '<div class="grid"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>');
    var c = b.counts || {};
    if (!r.archived && !c.horses && !S.filter && S.prio === "all") {
      var arch = b.archived_count ? '<p class="muted" style="margin-top:14px">' + b.archived_count + ' archived. <a href="#/archived">See archived horses</a></p>' : "";
      return shell(active, "Black Book", head + emptyState() + arch);
    }
    var kpis = '<section class="kpis" aria-label="Summary">' +
      '<div class="kpi"><span class="bb-cap">Horses</span><b>' + (c.horses || 0) + "<small>followed</small></b></div>" +
      '<div class="kpi"><span class="bb-cap">Running today</span><b>' + (c.runningToday || 0) + "<small>on file</small></b></div>" +
      '<div class="kpi"><span class="bb-cap">Firming</span><span class="soon">Coming soon</span></div>' +
      '<div class="kpi"><span class="bb-cap">Drifting</span><span class="soon">Coming soon</span></div>' +
      '<div class="kpi gold"><span class="bb-cap">Model sees more</span><span class="soon">Coming soon</span></div></section>';
    var bp = c.byPriority || {};
    var seg = '<div class="seg" role="group" aria-label="Priority">' + [["all", "All", c.horses || 0], ["high", "High", bp.high || 0], ["med", "Med", bp.med || 0], ["low", "Low", bp.low || 0]].map(function (s) {
      return '<button type="button" data-act="prio" data-v="' + s[0] + '" aria-pressed="' + (S.prio === s[0]) + '"' + (s[0] !== "all" ? ' style="--c:var(--' + s[0] + ')"' : "") + ">" +
        (s[0] !== "all" ? '<i class="dot"></i>' : "") + s[1] + " " + s[2] + "</button>";
    }).join("") + "</div>";
    var chips = '<div class="chips">' +
      '<button type="button" class="fchip" data-act="filter" data-v="today" aria-pressed="' + (S.filter === "today" && !r.archived) + '">' + svg("clock") + "Running today</button>" +
      '<button type="button" class="fchip" data-act="filter" data-v="firming" aria-pressed="' + (S.filter === "firming") + '">' + svg("trend") + "Firming <small>soon</small></button>" +
      '<button type="button" class="fchip" data-act="filter" data-v="drifting" aria-pressed="' + (S.filter === "drifting") + '">Drifting <small>soon</small></button>' +
      '<button type="button" class="fchip gold" data-act="filter" data-v="model_sees_more" aria-pressed="' + (S.filter === "model_sees_more") + '">' + svg("diamond") + "Model sees more <small>soon</small></button>" +
      '<a class="fchip" href="' + (r.archived ? "#/" : "#/archived") + '" aria-pressed="' + !!r.archived + '">' + svg("archive") + "Archived " + (b.archived_count || 0) + "</a></div>";
    var sort = '<label class="sortsel">' + svg("sort") + '<span>Sort</span><select data-act="sort" aria-label="Sort">' +
      '<option value="nextJump"' + (S.sort === "nextJump" ? " selected" : "") + ">Next jump</option>" +
      '<option value="priority"' + (S.sort === "priority" ? " selected" : "") + ">Priority</option>" +
      '<option value="priceMove" disabled>Price move (coming soon)</option></select></label>';
    var rows = b.entries || [];
    var body;
    if (!rows.length) {
      var why = r.archived ? "No archived horses." :
        S.filter === "today" ? "None of your horses has a race on file today." :
        S.filter ? "Coming soon. This filter needs prices or model values, and those are not stored yet." : "No horses at this priority.";
      body = '<div class="msg"><h2>Nothing to show</h2><p>' + esc(why) + "</p></div>";
    } else {
      body = '<div class="grid">' + rows.map(function (e) { return card(e, r.archived); }).join("") + "</div>";
    }
    return shell(active, r.archived ? "Archived" : "Black Book", head + kpis + '<div class="controls">' + seg + chips + sort + "</div>" + body);
  }

  // ── upcoming ───────────────────────────────────────────────────────
  function upcomingView() {
    var u = S.upcoming;
    var head = '<div style="margin-bottom:10px">' + ownerChip("Owner only") + '</div><div class="bb-head"><div><h1 class="bb-h1">Upcoming runs</h1><p class="bb-sub">Every Black Book horse with a race on file, in jump order. All times ' +
      esc(tzName()) + ".</p></div>" + '<div class="seg" role="group" aria-label="Priority"><button type="button" data-act="upf" data-v="all" aria-pressed="' + (S.upFilter === "all") +
      '">All</button><button type="button" data-act="upf" data-v="high" aria-pressed="' + (S.upFilter === "high") + '" style="color:var(--high)">High</button></div></div>';
    if (!u) return shell("upcoming", "Upcoming runs", head + '<div class="sk"></div>');
    var rows = (u.entries || []).filter(function (e) { return hasNext(e.next) && toDate(e.next.jump_at) && (S.upFilter === "all" || e.priority === "high"); });
    var t = now();
    var groups = {};
    rows.forEach(function (e) {
      var d = toDate(e.next.jump_at);
      var k = dayKey(d);
      (groups[k] = groups[k] || []).push(e);
    });
    var today = dayKey(new Date(t));
    var keys = [];
    for (var i = 0; i < 7; i++) keys.push(dayKey(new Date(t + i * 86400000)));
    Object.keys(groups).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    keys.sort();
    keys = keys.filter(function (k) { return k >= today || groups[k]; });
    var html = "";
    if (!rows.length) {
      html += '<div class="msg"><h2>No runs on file</h2><p>None of your horses has a race on file in the next 7 days. A start shows here once its race is snapshotted.</p></div>';
    } else {
      keys.forEach(function (k, idx) {
        var list = groups[k] || [];
        var first = list[0] ? toDate(list[0].next.jump_at) : new Date(k + "T02:00:00Z");
        var title = k === today ? "Today" : idx === 1 && k === keys[1] && k === dayKey(new Date(t + 86400000)) ? "Tomorrow" : fmtDay(first);
        html += '<div class="dayh"><h2>' + esc(title) + "</h2><span>" + (title === "Today" || title === "Tomorrow" ? esc(fmtDay(first)) + " · " : "") +
          (list.length ? list.length + (list.length === 1 ? " run" : " runs") : "No runs") + "</span></div>";
        if (!list.length) { html += '<div class="dashrow">None of your horses are entered.</div>'; return; }
        var drewNow = k !== today;
        list.forEach(function (e) {
          var d = toDate(e.next.jump_at);
          var past = d.getTime() <= t;
          if (!drewNow && !past) {
            html += '<div class="nowline"><span>Now · ' + esc(fmtTime(new Date(t)) + " " + tzName(new Date(t))) + "</span></div>";
            drewNow = true;
          }
          html += timelineRow(e, d, past, t);
        });
        if (!drewNow) html += '<div class="nowline"><span>Now · ' + esc(fmtTime(new Date(t)) + " " + tzName(new Date(t))) + "</span></div>";
      });
    }
    var none = (u.noUpcoming || []).filter(function (e) { return S.upFilter === "all" || e.priority === "high"; });
    if (none.length) {
      html += '<section class="panel noup"><span class="bb-cap">No upcoming run</span><div class="list">' + none.map(function (e) {
        var why = e.next && e.next.state === "scratched" ? "Scratched · " + raceLine(e.next) : "Not entered";
        return '<a href="#/horse/' + esc(e.id) + '">' + mono(e) + "<div><b>" + esc(e.horse_name) + pendingTag(e) + "</b><span>" + why + "</span></div>" + badge(prioOf(e)) + "</a>";
      }).join("") + "</div></section>";
    }
    return shell("upcoming", "Upcoming runs", head + html);
  }
  function timelineRow(e, d, past, t) {
    var key = prioOf(e);
    var soon = isSoon(e.next);
    var c = fmtClock(d);
    var tags = (e.pending ? '<span class="tag pending">Pending match</span>' : "") + (soon ? '<span class="tag amber">Jump soon</span>' : "") + (past ? '<span class="tag">Awaiting result</span>' : "");
    var raceBits = [];
    if (e.next.distance_m) raceBits.push(e.next.distance_m + "m");
    if (e.next.track) raceBits.push(e.next.track);
    if (e.next.barrier) raceBits.push("Barrier " + e.next.barrier);
    if (e.next.runner_no) raceBits.push("No. " + e.next.runner_no);
    if (e.next.field_size) raceBits.push(e.next.field_size + " runners");
    return '<div class="trow ' + key + (soon ? " soon" : "") + (past ? " past" : "") + '"><div class="tm"><b>' + esc(c.hm) + "</b><small>" + esc(c.ap) + "</small><small>" +
      (past ? "Jumped " + esc(relIn(d.getTime() - t)) : esc(relIn(d.getTime() - t))) + '</small></div><div class="rail"><i></i></div>' +
      '<a class="rc" href="#/horse/' + esc(e.id) + '"><div class="who">' + mono(e) + "<div><b>" + esc(e.horse_name) + '</b><div class="tags">' + badge(key) + tags + "</div></div></div>" +
      '<div class="race"><b>' + raceLine(e.next) + "</b><span>" + esc(raceBits.join(" · ")) + "</span></div>" +
      '<div class="col price"><span class="bb-cap">Price</span><span>Coming soon</span>' + (e.bet_price ? "<span>You got " + fmtPrice(e.bet_price) + "</span>" : "") + "</div>" +
      '<div class="col model"><span class="bb-cap">Win · Exp. finish ' + ownerChip("") + "</span><span>Coming soon</span></div>" +
      '<div class="ringcol">' + ringHtml(e.next.jump_at, true) + "</div></a></div>";
  }

  // ── detail ─────────────────────────────────────────────────────────
  function detailView(id) {
    var d = S.detail[id];
    var crumb = '<nav class="crumb" aria-label="Breadcrumb"><a href="#/">Black Book</a>' + svg("chev").replace("<svg", '<svg width="14" height="14"') + "<b>" +
      esc(d && d.entry ? d.entry.horse_name : "Horse") + "</b></nav>";
    if (!d) return shell("list", "Horse", crumb + '<div class="sk"></div>');
    if (d.missing) return shell("list", "Horse", crumb + '<div class="msg"><h2>Not in your Black Book</h2><p>This horse was removed or never added.</p><a class="btn" href="#/">Back to the Black Book</a></div>');
    var e = d.entry;
    var key = prioOf(e);
    var nx = e.next;
    var meta = pedigree(e);
    var nxHtml = "";
    if (hasNext(nx) && nx.state !== "scratched") {
      nxHtml = '<div class="nx"><div><span class="bb-cap">Next start</span><b>' + raceLine(nx) + "</b><span>" + raceDetail(nx) + "</span></div>" + ringHtml(nx.jump_at) + "</div>";
    } else if (hasNext(nx)) {
      nxHtml = '<div class="nx"><div><span class="bb-cap">Next start</span><b>' + raceLine(nx) + '</b><span>Scratched</span></div><span class="glyph red">' + svg("x") + "</span></div>";
    } else {
      nxHtml = '<div class="nx"><div><span class="bb-cap">Next start</span><b>Not entered</b><span>No race on file yet</span></div><span class="glyph dash">' + svg("flag") + "</span></div>";
    }
    var arch = e.archived_at ? '<div class="banner">Archived after 120 days with no run. <button class="btn primary" type="button" data-act="restore" data-id="' + esc(e.id) +
      '" style="margin-left:10px;min-height:36px">Restore</button></div>' : "";
    var head = '<section class="dhead ' + key + '">' + mono(e, true) + '<div class="who">' + badge(key, true) + "<h1>" + esc(e.horse_name) + "</h1>" + pendingTag(e) +
      (meta ? '<div class="meta">' + esc(meta) + "</div>" : "") + '<div class="last">' + lastLine(e.last_result, "Last:") + "</div></div>" + nxHtml + "</section>";
    var msm = '<section class="msm">' + svg("diamond").replace("<svg", '<svg width="22" height="22" style="stroke:var(--gold);fill:none;stroke-width:2"') + "<b>Model sees more</b>" + ownerChip() +
      '<span class="chip-soon">Coming soon</span><span>Shows when the model expects a top-4 finish and the market has the horse at $15.00 or longer, before the jump.</span></section>';
    var got = fmtPrice(e.bet_price);
    var priceHist = '<section class="panel"><span class="bb-cap">Price history · open to now</span><div class="chartbox" style="margin-top:14px">' +
      (got ? '<div class="yg" style="top:42%"><span>You got ' + got + "</span></div>" : "") + '<span class="c">Price history · Coming soon</span></div>' +
      '<p class="muted small" style="margin:12px 0 0">Open, high, low, now and the move since open show here once prices are stored.</p></section>';
    var models = '<div class="pair"><section class="panel"><span class="bb-cap">With-price model</span><div class="soonbox" style="margin-top:14px"><strong>Coming soon</strong><span>Win % and place %. Uses the market price as an input.</span></div>' +
      '<p class="muted small" style="margin:12px 0 0">' + DISCLAIMER + "</p></section>" +
      '<section class="panel"><span class="bb-cap" style="display:flex;justify-content:space-between;align-items:center">Without-price model ' + ownerChip() + '</span><div class="soonbox" style="margin-top:14px"><strong>Coming soon</strong><span>Expected finishing position. Form and conditions only.</span></div></section></div>';
    var runs = (d.recentRuns || []);
    var runsHtml = runs.length ? '<table class="runs"><tbody>' + runs.map(function (run) {
      var bits = [];
      if (run.margin) bits.push(run.margin);
      if (run.meeting) bits.push(run.meeting);
      if (run.distance_m) bits.push(run.distance_m + "m");
      if (run.track) bits.push(run.track);
      return "<tr><td>" + esc(fmtIsoDay(run.race_date)) + "</td><td>" + (resultText(run) ? '<span class="res ' + resultClass(run) + '">' + esc(resultText(run)) + "</span>" +
        (run.result ? ' <span class="muted small">' + esc(run.result) + "</span>" : "") : '<span class="muted">Ran</span>') + "</td><td>" + esc(bits.join(" · ")) + "</td></tr>";
    }).join("") + "</tbody></table>" : '<p class="muted">No runs on file.</p>';
    var notePanel = '<section class="panel"><span class="bb-cap">Your note</span>' + (e.note ? '<p class="note" style="margin-top:12px;-webkit-line-clamp:unset;font-size:16px;border-color:var(--' + key + ')">' + esc(e.note) + "</p>" : '<p class="muted">No note yet.</p>') +
      '<div class="bb-cap" style="margin-top:22px">Recent runs</div>' + runsHtml + '<p class="muted small" style="margin:10px 0 0">No starting price is stored, so none is shown.</p></section>';
    var market = '<section class="panel"><span class="bb-cap" style="display:flex;justify-content:space-between;align-items:center">Market price vs ours ' + ownerChip() + '</span><div class="soonbox" style="margin-top:14px"><strong>Coming soon</strong><span>Market chance against our chance, once both are stored.</span></div></section>';
    var value = got ? '<section class="panel"><span class="bb-cap">Value vs your price</span><div style="display:flex;justify-content:space-between;margin:12px 0"><span>You got <b style="font-size:24px">' + got +
      '</b></span><span class="muted">Now <b>Coming soon</b></span></div><div class="soonbox" style="min-height:90px"><span>The meter compares your price with today’s price once it is stored. A rough guide, not a result.</span></div></section>' : "";
    var t = TIER_DEFAULTS;
    var col = key === "low" ? 1 : key === "med" ? 2 : 3;
    var pills = t.filter(function (row) { return row[0] !== "Discord DM"; }).map(function (row) {
      var v = row[col];
      return '<span class="pill' + (v ? "" : " off") + '">' + (v ? svg("bell").replace("<svg", '<svg width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2"') : "") + esc(row[0] + (v && v !== "on" ? " " + v : "") + (v ? "" : " off")) + "</span>";
    }).join("");
    var alerts = '<section class="panel"><span class="bb-cap">Alerts · ' + PRIO[key].label + '</span><div class="pills" style="margin-top:14px">' + pills + "</div>" +
      '<p class="muted small">Tier defaults. Alerts are not sent yet; the two settings below are stored for this horse.</p><div class="toggles">' +
      toggleRow("dms_enabled", "Discord DM", "High priority pings go by DM", e.dms_enabled, false) +
      toggleRow("jump_soon", "Jump soon", key === "high" ? "15 minutes before the jump" : "High priority only, 15 minutes before the jump", e.jump_soon, key !== "high") + "</div></section>";
    var edit = e.archived_at ? "" : '<section class="panel" id="bb-edit"><span class="bb-cap">Edit</span><div class="field"><label>Priority</label>' + prioPicker(key, "edit-prio") +
      '<p class="tierline small">' + esc(PRIO[key].desc) + '</p></div><div class="field"><label for="bb-note">Your note</label><textarea id="bb-note" maxlength="200">' + esc(e.note) +
      '</textarea><span class="hint">Up to 200 characters.</span></div><div class="field"><label for="bb-price">Your price</label><div class="money"><span>$</span><input id="bb-price" inputmode="decimal" placeholder="' +
      (got ? got.slice(1) : "4.20") + '" autocomplete="off"></div><span class="hint">' + (got ? "Latest logged price " + got + ". A new price is added, not replaced." : "Optional. The price you got, AUD decimal.") +
      '</span></div><div class="dangerzone" style="margin-top:16px"><button class="btn primary" type="button" data-act="save" data-id="' + esc(e.id) + '">Save</button>' +
      '<button class="btn danger" type="button" data-act="remove" data-id="' + esc(e.id) + '">Remove</button></div></section>';
    var body = crumb + arch + head + msm + '<div class="dgrid"><div class="dcol">' + priceHist + models + notePanel + '</div><div class="dcol">' + market + value + alerts + edit + "</div></div>";
    return shell("list", e.horse_name, body);
  }
  function toggleRow(field, title, sub, on, disabled) {
    return '<div class="trow2"><span class="ic">' + svg(field === "jump_soon" ? "clock" : "bell") + '</span><div class="tx"><b>' + esc(title) + "</b><span>" + esc(sub) + "</span></div>" +
      '<button type="button" class="switch" role="switch" aria-label="' + esc(title) + '" aria-checked="' + (!!on && !disabled) + '" data-act="toggle" data-field="' + field + '"' + (disabled ? " disabled" : "") + "></button></div>";
  }
  function prioPicker(key, act) {
    return '<div class="prio" role="radiogroup" aria-label="Priority">' + ["low", "med", "high"].map(function (k) {
      return '<button type="button" class="' + k + '" role="radio" aria-pressed="' + (k === key) + '" aria-checked="' + (k === key) + '" data-act="' + act + '" data-v="' + k + '">' + bars(PRIO[k].bars) + PRIO[k].label + "</button>";
    }).join("") + "</div>";
  }

  // ── add flow ───────────────────────────────────────────────────────
  function openAdd(tab) {
    if (!S.add) S.add = { tab: tab || "search", q: "", hits: null, races: null, race: null, card: null, pick: null, prio: "med", note: "", price: "", dms: false, jump: false, ambiguous: null, busy: false, err: "" };
    else S.add.tab = tab || S.add.tab;
    renderModal();
    if (S.add.tab === "race" && !S.add.races) loadRaces();
    setTimeout(function () { var i = document.getElementById("bb-q"); if (i && !S.add.pick) i.focus(); }, 30);
  }
  function closeAdd() {
    S.add = null;
    renderModal();
    if (/^#\/add/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search + "#/");
  }
  var searchTimer = null;
  var searchSeq = 0;
  function onSearchInput(v) {
    S.add.q = v;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async function () {
      var seq = ++searchSeq;
      var q = S.add && S.add.q.trim();
      if (!q || q.replace(/[^a-z0-9]/gi, "").length < 2) { S.add.hits = null; paintHits(); return; }
      var res = await call("GET", A.paths.search(q));
      if (!S.add || seq !== searchSeq) return;
      S.add.hits = res.status === 200 ? res.data.hits || [] : [];
      S.add.err = res.status === 200 ? "" : "Search did not load. Try again.";
      paintHits();
    }, 250);
  }
  function paintHits() {
    var box = document.getElementById("bb-hits");
    if (box) box.innerHTML = hitsHtml();
  }
  function hitsHtml() {
    var a = S.add;
    var q = a.q.trim();
    if (a.err) return '<p class="muted">' + esc(a.err) + "</p>";
    if (!a.hits) return '<p class="muted small">Type two letters or more. Search reads horses already on file; it does not fetch a race.</p>';
    var html = '<div class="bb-cap">' + a.hits.length + (a.hits.length === 1 ? " horse" : " horses") + "</div>";
    html += a.hits.map(function (h, i) {
      var held = h.inBlackBook;
      var sub = [];
      if (h.sire || h.dam) sub.push(pedigree(h));
      return '<div class="hit">' + mono({ horse_name: h.horse_name, priority: held && held !== "archived" ? held : "low" }) + '<div class="t"><b>' + highlight(h.horse_name, q) + "</b>" +
        (sub.length ? "<span>" + esc(sub.join(" · ")) + "</span>" : "") + "<span>" + esc(h.last_start || "No start on file") + "</span></div>" +
        (held && held !== "archived" ? '<a class="addbtn in" href="#/horse/' + esc(h.entry_id) + '" aria-label="In Black Book">' + svg("check") + "</a>" :
          '<button type="button" class="addbtn" data-act="pick-hit" data-i="' + i + '" aria-label="Add ' + esc(h.horse_name) + '">' + svg("plus") + "</button>") + "</div>";
    }).join("");
    if (q.length >= 2 && !a.hits.some(function (h) { return h.horse_name.toLowerCase() === q.toLowerCase(); })) {
      html += '<div class="hit"><div class="t"><b>Add “' + esc(q) + '” as typed</b><span>Not on file yet. It is stored by name and matched once it races.</span></div>' +
        '<button type="button" class="addbtn" data-act="pick-typed" aria-label="Add as typed">' + svg("plus") + "</button></div>";
    }
    return html;
  }
  async function loadRaces() {
    var res = await call("GET", A.paths.races());
    if (!S.add) return;
    S.add.races = res.status === 200 && res.data.ok ? res.data.races || [] : [];
    S.add.err = res.status === 200 ? "" : res.status === 503 ? "Race cards are not available right now." : "Race cards did not load.";
    renderModal();
  }
  async function loadCard(id) {
    S.add.card = { loading: true };
    renderModal();
    var res = await call("GET", A.paths.raceCard(id));
    if (!S.add) return;
    S.add.card = res.status === 200 && res.data.ok ? res.data : { error: res.status === 503 ? "This race card is not available right now." : "This race card did not load." };
    renderModal();
  }
  function raceTab() {
    var a = S.add;
    if (a.card) {
      if (a.card.loading) return '<div class="sk" style="height:220px"></div>';
      if (a.card.error) return '<p class="muted">' + esc(a.card.error) + '</p><button class="btn" type="button" data-act="cards-back">' + svg("back") + "All races</button>";
      var race = a.card.race || {};
      var jd = toDate(race.jump_at);
      var info = [race.distance_m ? race.distance_m + "m" : "", race.name || "", jd ? fmtTime(jd) + " " + tzName(jd) : "", race.track || ""].filter(Boolean).join(" · ");
      return '<button class="btn" type="button" data-act="cards-back" style="min-height:36px;margin-bottom:10px">' + svg("back") + "All races</button><h3 style=\"margin:4px 0 2px\">" +
        esc((race.meeting || "") + (race.race_no ? " · R" + race.race_no : "")) + '</h3><p class="muted small" style="margin:0 0 8px">' + esc(info) + "</p>" +
        (!(a.card.runners || []).length ? '<div class="msg" style="margin-top:8px"><h2>Not entered</h2><p>No runners on file for this race yet. Cards fill in after the morning build.</p></div>' : "") +
        (a.card.runners || []).map(function (rn, i) {
          var held = rn.inBlackBook && rn.inBlackBook !== "archived";
          var sub = [rn.trainerName, rn.barrier ? "Barrier " + rn.barrier : ""].filter(Boolean).join(" · ");
          return '<div class="runner"><span class="no">' + esc(rn.no == null ? "" : rn.no) + "</span>" + mono({ horse_name: rn.horseName, priority: held ? rn.inBlackBook : "low" }, false, rn.silks || rn.silk_url_64x64) +
            '<div class="t"><b>' + esc(rn.horseName) + "</b><span>" + esc(sub) + "</span></div>" + (rn.price ? '<span class="pr">' + fmtPrice(rn.price) + "</span>" : "") +
            (held ? '<a class="addwide in" href="#/horse/' + esc(rn.entry_id) + '">' + "✓ In Black Book</a>" : '<button type="button" class="addwide" data-act="pick-runner" data-i="' + i + '">+ Black Book</button>') + "</div>";
        }).join("") + '<p class="muted small">Prices are the cached race card price when one is on file.</p>';
    }
    if (!a.races) return '<div class="sk" style="height:220px"></div>';
    if (!a.races.length) return '<p class="muted">' + esc(a.err || "No upcoming thoroughbred races are cached right now.") + "</p>";
    return '<div class="racepick">' + a.races.slice(0, 60).map(function (r) {
      var d = toDate(r.start_time);
      return '<button type="button" data-act="pick-race" data-id="' + esc(r.id) + '"><b>' + esc(r.label || ((r.meeting || "") + " R" + (r.race_number || ""))) + "</b><span>" + (d ? esc(fmtDay(d) + " · " + fmtTime(d)) : "") + "</span>" + svg("chev").replace("<svg", '<svg width="16" height="16" style="stroke:var(--muted);fill:none;stroke-width:2"') + "</button>";
    }).join("") + "</div>";
  }
  function pickStep() {
    var a = S.add;
    var p = a.pick;
    var key = a.prio;
    var col = key === "low" ? 1 : key === "med" ? 2 : 3;
    var amb = a.ambiguous ? '<div class="banner">More than one horse is on file as “' + esc(p.name) + '”. Pick the right one.</div>' + a.ambiguous.map(function (h, i) {
      return '<div class="hit"><div class="t"><b>' + esc(h.horse_name) + "</b><span>" + esc(pedigree(h) || "Pedigree not on file") + "</span><span>" + esc(h.last_start || "No start on file") + "</span></div>" +
        '<button type="button" class="addwide" data-act="pick-amb" data-i="' + i + '">This one</button></div>';
    }).join("") : "";
    var toggles = TIER_DEFAULTS.filter(function (row) { return row[0] !== "Discord DM" && row[0] !== "Jump soon"; }).map(function (row) {
      var v = row[col];
      return '<div class="trow2"><span class="ic">' + svg("bell") + '</span><div class="tx"><b>' + esc(row[0]) + "</b><span>Tier default</span></div><span class=\"val\">" + (v ? (v === "on" ? "On" : esc(v)) : "Off") + "</span></div>";
    }).join("") +
      '<div class="trow2"><span class="ic">' + svg("clock") + '</span><div class="tx"><b>Jump soon</b><span>' + (key === "high" ? "15 minutes before the jump" : "High priority only") +
      '</span></div><button type="button" class="switch" role="switch" aria-label="Jump soon" aria-checked="' + (a.jump && key === "high") + '" data-act="add-toggle" data-field="jump"' + (key !== "high" ? " disabled" : "") + "></button></div>" +
      '<div class="trow2"><span class="ic">' + svg("bell") + '</span><div class="tx"><b>Discord DM</b><span>High priority pings go by DM</span></div><button type="button" class="switch" role="switch" aria-label="Discord DM" aria-checked="' + !!a.dms + '" data-act="add-toggle" data-field="dms"></button></div>';
    return '<div class="sheet-b">' + amb + '<div class="chead">' + mono({ horse_name: p.name, priority: key }, false, p.silks) + '<div class="who"><h3 class="hname">' + esc(p.name) + '</h3><div class="hmeta">' + esc(p.meta || "") + "</div></div></div>" +
      '<div class="field"><label>Priority</label>' + prioPicker(key, "add-prio") + '<p class="tierline small">' + esc(PRIO[key].desc) + "</p></div>" +
      '<div class="pair" style="gap:12px"><div class="field"><label for="bb-add-note">Your note</label><textarea id="bb-add-note" maxlength="200" placeholder="Optional">' + esc(a.note) + "</textarea></div>" +
      '<div class="field"><label for="bb-add-price">Your price</label><div class="money"><span>$</span><input id="bb-add-price" inputmode="decimal" placeholder="Optional" value="' + esc(a.price) + '" autocomplete="off"></div></div></div>' +
      '<div class="field"><label>Alerts for ' + PRIO[key].label + ' priority</label><div class="toggles">' + toggles + '</div><span class="hint">Alerts follow the tier and are not sent yet. Jump soon and Discord DM are stored for this horse.</span></div>' +
      (a.err ? '<div class="banner" style="margin-top:12px">' + esc(a.err) + "</div>" : "") + "</div>" +
      '<div class="sheet-f"><button type="button" class="btn primary block" data-act="submit-add"' + (a.busy ? " disabled" : "") + ">" + svg("plus") + (a.busy ? "Adding…" : "Add to Black Book") + "</button></div>";
  }
  function renderModal() {
    var a = S.add;
    if (!a) { modalRoot.innerHTML = ""; document.body.style.overflow = ""; return; }
    document.body.style.overflow = "hidden";
    var title = a.pick ? "Priority and alerts" : "Add to Black Book";
    var head = '<div class="sheet-h">' + (a.pick ? '<button type="button" class="iconbtn" data-act="unpick" aria-label="Back">' + svg("back") + "</button>" : "") +
      '<h2 id="bb-add-title">' + title + '</h2><button type="button" class="iconbtn" data-act="close-add" aria-label="Close">' + svg("x") + "</button></div>";
    var body;
    if (a.pick) body = pickStep();
    else {
      body = '<div class="sheet-b"><div class="tabs2" role="tablist"><button type="button" role="tab" data-act="add-tab" data-v="search" aria-selected="' + (a.tab === "search") +
        '">Search</button><button type="button" role="tab" data-act="add-tab" data-v="race" aria-selected="' + (a.tab === "race") + '">Race card</button></div>' +
        (a.tab === "search" ? '<label class="search">' + svg("search") + '<span class="sr">Horse name</span><input id="bb-q" type="search" autocomplete="off" placeholder="Horse name" value="' + esc(a.q) +
          '"></label><div class="hits" id="bb-hits">' + hitsHtml() + '</div><button type="button" class="linkrow" data-act="add-tab" data-v="race">' + svg("flag") + "Browse today’s race cards</button>" : raceTab()) +
        '<p class="muted small" style="margin:16px 0 0">' + DISCLAIMER + " " + HELPLINE + "</p></div>";
    }
    modalRoot.innerHTML = '<div class="scrim" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="bb-add-title">' + head + body + "</div></div>";
  }
  async function submitAdd() {
    var a = S.add;
    if (!a || a.busy) return;
    var noteEl = document.getElementById("bb-add-note");
    var priceEl = document.getElementById("bb-add-price");
    if (noteEl) a.note = noteEl.value;
    if (priceEl) a.price = priceEl.value;
    var price = priceInput(a.price);
    if (!price.ok) { a.err = "Your price should be a decimal price such as 4.20."; renderModal(); return; }
    var p = a.pick;
    var body = { priority: a.prio, note: a.note.trim(), dms_enabled: !!a.dms };
    if (a.prio === "high") body.jump_soon = !!a.jump;
    if (price.value != null) body.betPrice = price.value;
    if (p.kind === "runner") { body.display = p.name; if (p.horse_id) body.horse_id = p.horse_id; }
    else { body.query = p.name; if (p.token) body.token = p.token; }
    a.busy = true; a.err = "";
    renderModal();
    var res = await call("POST", A.paths.entries(), body);
    if (!S.add) return;
    a.busy = false;
    var d = res.data || {};
    if (res.status === 200 && d.ok) {
      var name = d.entry && d.entry.horse_name;
      closeAdd();
      toast((d.code === "restored" ? "Restored " : "Added ") + (name || "horse") + "." + (d.priority_adjusted ? " Priority adjusted." : ""));
      S.book = null;
      location.hash = "#/";
      load();
      return;
    }
    if (d.code === "ambiguous") { a.ambiguous = d.horses || []; renderModal(); return; }
    if (res.status !== 401 && res.status !== 404) a.err = A.describeAddError(res.status, d);
    renderModal();
  }

  // ── edits ──────────────────────────────────────────────────────────
  var editPrio = null;
  async function patch(id, body, okMsg) {
    var res = await call("PATCH", A.paths.entry(id), body);
    if (res.status === 200 && res.data.ok) {
      if (S.detail[id]) S.detail[id].entry = res.data.entry;
      toast(okMsg || "Saved.");
      if (res.data.jump_soon_ignored) toast("Jump soon is for High priority only.");
      editPrio = null;
      render();
      return true;
    }
    if (res.status !== 401 && res.status !== 404) toast(A.describeEditError(res.status, res.data));
    else if (res.status === 404 && res.data && res.data.code === "missing") toast(A.describeEditError(404, res.data));
    return false;
  }
  async function restore(id) {
    var res = await call("POST", A.paths.restore(id), {});
    if (res.status === 200 && res.data.ok) {
      toast("Restored " + (res.data.entry ? res.data.entry.horse_name : "horse") + ".");
      delete S.detail[id];
      S.book = null;
      load();
    } else if (res.status !== 401) toast(A.describeEditError(res.status, res.data, "restore"));
  }
  var toastTimer = null;
  function toast(text) {
    var el = document.getElementById("bb-toast");
    if (!el) { el = document.createElement("div"); el.id = "bb-toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  // ── render and events ─────────────────────────────────────────────
  function render() {
    var r = route();
    if (S.auth === "signin") {
      app.innerHTML = bare(gateHtml());
      return;
    }
    if (S.auth === "denied") {
      app.innerHTML = bare('<div class="msg"><h2>Not the owner</h2><p>This page is not available on your account. Black Book is for the owner only.</p><button type="button" class="btn" data-act="signout">Sign out</button></div>');
      return;
    }
    if (S.auth === "checking") { app.innerHTML = bare('<div class="sk"></div>'); return; }
    var html;
    if (r.view === "upcoming") html = upcomingView();
    else if (r.view === "horse") {
      html = detailView(r.id);
    } else html = listView();
    var focus = document.activeElement && document.activeElement.id;
    app.innerHTML = html;
    if (r.view === "horse" && editPrio) {
      document.querySelectorAll('[data-act="edit-prio"]').forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === editPrio)); });
    }
    if (focus && document.getElementById(focus)) document.getElementById(focus).focus();
  }
  function tick() {
    document.querySelectorAll("#bb-app [data-jump]").forEach(function (el) {
      var html = ringHtml(el.getAttribute("data-jump"), el.getAttribute("data-sm") === "1");
      if (el.outerHTML !== html) el.outerHTML = html;
    });
  }
  function onClick(ev) {
    var t = ev.target.closest ? ev.target.closest("[data-act]") : null;
    if (!t) return;
    var act = t.getAttribute("data-act");
    var v = t.getAttribute("data-v");
    if (act === "scrim") { if (ev.target === t) closeAdd(); return; }
    if (act === "signout") { ev.preventDefault(); signOut(); return; }
    if (act === "prio") { S.prio = v; S.book && (S.book.entries = null); loadBook(); return; }
    if (act === "filter") { S.filter = S.filter === v ? "" : v; if (/^#\/archived/.test(location.hash)) location.hash = "#/"; else loadBook(); return; }
    if (act === "upf") { S.upFilter = v; render(); return; }
    if (act === "restore") { restore(t.getAttribute("data-id")); return; }
    if (act === "edit-prio") { editPrio = v; document.querySelectorAll('[data-act="edit-prio"]').forEach(function (b) { b.setAttribute("aria-pressed", String(b === t)); b.setAttribute("aria-checked", String(b === t)); }); return; }
    if (act === "save") {
      var id = t.getAttribute("data-id");
      var cur = S.detail[id] && S.detail[id].entry;
      if (!cur) return;
      var body = {};
      var noteEl = document.getElementById("bb-note");
      var priceEl = document.getElementById("bb-price");
      if (editPrio && editPrio !== cur.priority) body.priority = editPrio;
      if (noteEl && noteEl.value.trim() !== (cur.note || "")) body.note = noteEl.value.trim();
      var price = priceInput(priceEl ? priceEl.value : "");
      if (!price.ok) { toast("Your price should be a decimal price such as 4.20."); return; }
      if (price.value != null) body.betPrice = price.value;
      if (!Object.keys(body).length) { toast("Nothing to save."); return; }
      patch(id, body);
      return;
    }
    if (act === "remove") {
      var rid = t.getAttribute("data-id");
      var ent = S.detail[rid] && S.detail[rid].entry;
      if (!root.confirm("Remove " + (ent ? ent.horse_name : "this horse") + " from your Black Book? Its note and logged prices go too. This cannot be undone.")) return;
      call("DELETE", A.paths.entry(rid)).then(function (res) {
        if (res.status === 200) { toast("Removed."); delete S.detail[rid]; S.book = null; location.hash = "#/"; }
        else if (res.status !== 401) toast("Not removed. Try again.");
      });
      return;
    }
    if (act === "toggle") {
      var r = route();
      var e = S.detail[r.id] && S.detail[r.id].entry;
      if (!e || t.disabled) return;
      var field = t.getAttribute("data-field");
      var b2 = {};
      b2[field] = t.getAttribute("aria-checked") !== "true";
      patch(e.id, b2);
      return;
    }
    // add flow
    if (act === "close-add") { closeAdd(); return; }
    if (act === "add-tab") { S.add.tab = v; S.add.err = ""; renderModal(); if (v === "race" && !S.add.races) loadRaces(); return; }
    if (act === "pick-race") { loadCard(t.getAttribute("data-id")); return; }
    if (act === "cards-back") { S.add.card = null; renderModal(); return; }
    if (act === "pick-hit") {
      var h = S.add.hits[+t.getAttribute("data-i")];
      S.add.pick = { kind: "search", name: h.horse_name, token: h.token, meta: h.last_start || pedigree(h) };
      S.add.err = ""; renderModal(); return;
    }
    if (act === "pick-typed") { S.add.pick = { kind: "typed", name: S.add.q.trim(), meta: "Stored by name" }; S.add.err = ""; renderModal(); return; }
    if (act === "pick-runner") {
      var rn = S.add.card.runners[+t.getAttribute("data-i")];
      var race = S.add.card.race || {};
      var jd = toDate(race.jump_at);
      S.add.pick = { kind: "runner", name: rn.horseName, horse_id: rn.horseId, silks: rn.silks || rn.silk_url_64x64,
        meta: [(race.meeting || "") + (race.race_no ? " R" + race.race_no : ""), jd ? fmtTime(jd) + " " + tzName(jd) : ""].filter(Boolean).join(" · ") };
      S.add.err = ""; renderModal(); return;
    }
    if (act === "pick-amb") {
      var hh = S.add.ambiguous[+t.getAttribute("data-i")];
      S.add.pick = { kind: "search", name: hh.horse_name, token: hh.token, meta: hh.last_start || pedigree(hh) };
      S.add.ambiguous = null;
      submitAdd();
      return;
    }
    if (act === "unpick") { keepAddFields(); S.add.pick = null; S.add.ambiguous = null; S.add.err = ""; renderModal(); return; }
    if (act === "add-prio") { keepAddFields(); S.add.prio = v; renderModal(); return; }
    if (act === "add-toggle") { if (t.disabled) return; keepAddFields(); var f = t.getAttribute("data-field"); S.add[f] = !S.add[f]; renderModal(); return; }
    if (act === "submit-add") { submitAdd(); return; }
  }
  function keepAddFields() {
    var n = document.getElementById("bb-add-note");
    var p = document.getElementById("bb-add-price");
    if (n) S.add.note = n.value;
    if (p) S.add.price = p.value;
  }
  // A silk that fails to load (blocked, 404, offline) falls back to the monogram. Error events do not bubble, so capture.
  document.addEventListener("error", function (ev) {
    var im = ev.target;
    if (!im || im.tagName !== "IMG" || !im.parentNode || !im.hasAttribute("data-ini")) return;
    im.parentNode.textContent = im.getAttribute("data-ini");
  }, true);
  document.addEventListener("click", onClick);
  document.addEventListener("change", function (ev) {
    if (ev.target && ev.target.getAttribute("data-act") === "sort") { S.sort = ev.target.value; loadBook(); }
  });
  document.addEventListener("input", function (ev) {
    if (ev.target && ev.target.id === "bb-q" && S.add) onSearchInput(ev.target.value);
  });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && S.add) closeAdd(); });
  function onRoute() {
    if (S.auth === "signin" || S.auth === "denied") { render(); return; }
    var r = route();
    if (r.add) openAdd(r.add);
    else if (S.add) { S.add = null; renderModal(); }
    if (r.view === "list" && S.book && !r.add) S.book = null;
    if (!r.add || !S.book) load();
    else render();
    try { root.scrollTo(0, 0); } catch (e) {}
  }
  root.addEventListener("hashchange", onRoute);
  setInterval(tick, 1000);
  if (root.BBHandoff && root.BBHandoff.getAuthError()) {
    S.gateMsg = "Sign-in did not complete. Try again.";
  }
  render();
  onRoute();
})(typeof window !== "undefined" ? window : globalThis);