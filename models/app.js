/* TipBot model stats — horse-server comparison dashboard (GET /api/model-stats). */
(function () {
  "use strict";

  const APP_VERSION = "0.5.0";
  const CFG = window.ND_MODELS_CONFIG;
  const N = window.NDModelsNormalise;
  const DEMO = window.NDModelsDemo;
  const CAL = window.NDModelsCalendar;
  const DATES = window.NDModelsDates;
  const API = window.NDModelsApi;
  const FMT = window.NDModelsFormat;
  const BP = window.NDModelsBestPick;
  const HY = window.NDModelsHybrid;

  const UNAVAILABLE_MSG = "Model stats aren't live yet. Check back after the next TipBot update.";
  const NOT_CONFIGURED_MSG = "Model stats aren't set up on TipBot yet. Check back soon.";
  const DB_UNAVAILABLE_MSG = "The stats database is unavailable right now. Try again in a few minutes.";
  const FORBIDDEN_MSG =
    "You're signed in, but this Discord account isn't in the horse server. If you've just joined, sign in again so TipBot sees it.";
  const EXPIRED_MSG = "Your session has expired. Sign in with Discord again.";
  /* One automatic Discord bounce per 10 minutes on 401 (prompt=none makes it instant), so a bad token can't loop. */
  const REAUTH_KEY = "nd_models_reauth_at";
  const REAUTH_GAP_MS = 10 * 60 * 1000;
  const STAKED_SEG = { without_price: "Without", with_price: "With", agree: "Agree" };
  const RECON_KEY = "nd_models_include_reconstructed";
  const BP_UNAVAILABLE_MSG = "Best picks not available yet. Check back after the next TipBot update.";
  const HY_UNAVAILABLE_MSG = "HorsePicks AI Hybrid not available yet. Check back after the next TipBot update.";
  const LADDER_KEY = "nd_models_ladder_v1";
  const LADDER_LOSS_TEXT = {
    reset: "On a loss the ladder resets: the next best pick starts a new ladder at the starting stake, and that stake counts as more cash in.",
    stop: "On a loss the ladder stops (busted): the bank is gone and later picks aren't bet.",
  };

  const $ = (id) => document.getElementById(id);
  const fmt = (n, d) => (Number.isFinite(n) ? n.toFixed(d ?? 1) : "—");
  const fmtPct = (n) => (Number.isFinite(n) ? fmt(n, 1) + "%" : "—");
  const fmtPl = (n) => {
    if (!Number.isFinite(n)) return "—";
    const s = (n >= 0 ? "+" : "") + fmt(n, 1);
    return s;
  };
  const plClass = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");

  let state = {
    token: null,
    data: null,
    rangeFrom: "all",
    rangeTo: "",
    allTime: true,
    bankrollMode: "real",
    breakdownTab: "price_band",
    breakdownModel: "with_price",
    weekdayModel: "with_price",
    gateMessage: "",
    signingIn: false,
    forbidden: false,
    authHandled: false,
    notConfigured: false,
    thresholdMode: "bands",
    loadError: "",
    apiNotLive: false,
    calendarMonth: "",
    joinedByDate: null,
    stakedData: null,
    stakedModel: "without_price",
    stakedLoading: false,
    stakedNotLive: false,
    stakedError: "",
    includeReconstructed: false,
    reconstructedAvailable: null,
    bp: { loading: false, error: "", days: null, month: "" },
    ladder: { start: "", stake: 20, onLoss: "reset" },
    pageTab: "models",
    hy: { loading: false, error: "", days: null, month: "", fetched: false },
  };

  function isDemoMode() {
    if (!DEMO || !DEMO.isDemoHost()) return false;
    try {
      return new URLSearchParams(location.search).get("demo") === "1";
    } catch (e) {
      return false;
    }
  }

  function melbourneTime(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Melbourne",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d);
    } catch (e) {
      return iso;
    }
  }

  /** nd_models_owner_token (read-only fallback to Black Book's nd_owner_token on this origin). */
  function getToken() {
    try {
      return API.readToken(localStorage);
    } catch (e) {
      return "";
    }
  }

  function setToken(t) {
    try {
      if (t) API.saveToken(localStorage, t);
      else API.clearToken(localStorage);
    } catch (e) { /* ignore */ }
  }

  function getIncludeReconstructed() {
    try {
      return localStorage.getItem(RECON_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function setIncludeReconstructed(on) {
    try {
      if (on) localStorage.setItem(RECON_KEY, "1");
      else localStorage.removeItem(RECON_KEY);
    } catch (e) { /* ignore */ }
  }

  function signedIn() {
    return Boolean(state.token);
  }

  function setView() {
    const hasToken = signedIn();
    const authed = hasToken && !state.forbidden;
    $("auth-gate").hidden = authed;
    $("app-main").hidden = !authed;
    $("btn-signout").hidden = !hasToken;
    $("demo-badge").hidden = !isDemoMode() || !authed;
    if (!authed) {
      const msg = state.signingIn ? "Signing in…" : state.forbidden ? FORBIDDEN_MSG : state.gateMessage || "";
      $("gate-message").textContent = msg;
      const btn = $("btn-discord");
      btn.href = API.loginUrl(location.origin);
      btn.hidden = state.signingIn;
      btn.textContent = state.forbidden ? "Sign in again" : "Sign in with Discord";
    }
  }

  /** 401: token missing, bad or expired. Clear it and go back through Discord (the refresh route has no CORS for neilldata). */
  function handleUnauthorised() {
    if (state.authHandled) return;
    state.authHandled = true;
    signOutAndShowGate();
    state.gateMessage = EXPIRED_MSG;
    let last = 0;
    try { last = Number(localStorage.getItem(REAUTH_KEY)) || 0; } catch (e) { last = 0; }
    if (Date.now() - last > REAUTH_GAP_MS) {
      try { localStorage.setItem(REAUTH_KEY, String(Date.now())); } catch (e) { /* ignore */ }
      state.signingIn = true;
      setView();
      location.assign(API.loginUrl(location.origin));
      return;
    }
    setView();
  }

  /** 403: the token is valid but this account isn't in the horse server. Keep the token (it may be Black Book's
   *  shared one); show why, and offer "Sign in again" for someone who has just joined. No automatic loop. */
  function handleForbidden() {
    state.forbidden = true;
    state.data = null;
    state.stakedData = null;
    setView();
  }

  async function fetchModelStats(from, to, options) {
    const opts = options && typeof options === "object" ? options : {};
    if (isDemoMode()) {
      const wantRecon = shouldRequestReconstructed(opts);
      const raw = opts.stakedOnly
        ? DEMO.generateStakedDemoStats(to)
        : DEMO.generateDemoStats(from, to, { includeReconstructed: wantRecon });
      const data = N.normalizeStatsPayload(raw);
      return { ok: true, data: finishMainPayload(data, opts), demo: true };
    }
    const url = API.buildModelStatsUrl(CFG.API_BASE, from, to, {
      stakedOnly: !!opts.stakedOnly,
      includeReconstructed: shouldRequestReconstructed(opts),
    });
    const res = await API.requestModelStats(url, state.token);
    switch (res.kind) {
      case "ok": {
        const data = N.normalizeStatsPayload(res.data);
        return { ok: true, data: finishMainPayload(data, opts) };
      }
      case "signin":
        handleUnauthorised();
        return { ok: false, auth: true };
      case "forbidden":
        handleForbidden();
        return { ok: false, auth: true };
      case "not_configured":
        return { ok: false, notConfigured: true };
      case "not_live":
        return { ok: false, notLive: true };
      case "unavailable":
        return { ok: false, error: DB_UNAVAILABLE_MSG };
      case "rate_limited":
        return { ok: false, error: "Too many requests. Wait a couple of minutes and try again." };
      case "bad_request":
        return { ok: false, error: API.describeApiError(400, res.data) };
      default:
        return { ok: false, error: API.describeApiError(res.status, {}) };
    }
  }

  function shouldRequestReconstructed(opts) {
    if (opts && opts.stakedOnly) return false;
    if (state.includeReconstructed) return true;
    return state.reconstructedAvailable == null;
  }

  function finishMainPayload(data, opts) {
    if (opts && opts.stakedOnly) return data;
    rememberReconstructedAvailability(data);
    return N.filterReconstructed(data, state.includeReconstructed);
  }

  function rememberReconstructedAvailability(data) {
    const visible = FMT.reconstructedToggleVisible(data && data.meta, data && data.models);
    const flag = data && data.meta && Object.prototype.hasOwnProperty.call(data.meta, "reconstructed_available");
    if (visible) {
      state.reconstructedAvailable = true;
    } else if (flag && !data.meta.reconstructed_available) {
      state.reconstructedAvailable = false;
      if (state.includeReconstructed) {
        state.includeReconstructed = false;
        setIncludeReconstructed(false);
      }
    } else if (flag) {
      state.reconstructedAvailable = visible;
    }
    syncReconToggle();
  }

  function syncReconToggle() {
    const wrap = $("recon-toggle-wrap");
    const box = $("toggle-reconstructed");
    const visible = state.reconstructedAvailable === true;
    if (wrap) wrap.hidden = !visible;
    if (box) {
      box.checked = visible && state.includeReconstructed;
      box.disabled = !visible;
    }
  }

  function validateRange(from, to) {
    if (!to) return "Choose a valid end date.";
    if (state.allTime || from === "all") return "";
    if (!from || from > to) return "Choose a valid date range.";
    const days = (new Date(to) - new Date(from)) / 86400000;
    if (days > 365) return "Maximum range is 365 days.";
    return "";
  }

  function effectiveFrom() {
    return state.allTime ? "all" : $("date-from").value || state.rangeFrom;
  }

  function syncRangeInputs() {
    const fromInput = $("date-from");
    const allLabel = $("from-all-label");
    if (state.allTime) {
      fromInput.disabled = true;
      fromInput.value = "";
      allLabel.hidden = false;
    } else {
      fromInput.disabled = false;
      allLabel.hidden = true;
      if (state.rangeFrom && state.rangeFrom !== "all") fromInput.value = state.rangeFrom;
    }
  }

  function formatMetaBlock(meta) {
    return FMT.formatDataSince(meta, { includeReconstructed: state.includeReconstructed });
  }

  function smallSampleTag() {
    const tag = document.createElement("span");
    tag.className = "small-sample";
    tag.textContent = "small sample";
    return tag;
  }

  function modelShowsHyp(m) {
    if (!m) return false;
    if (m.summary && m.summary.hyp) return true;
    if ((m.by_weekday || []).some((r) => r.hyp_pl_units || r.hyp_roi_pct)) return true;
    if ((m.recent || []).some((r) => r.hyp_pl_units)) return true;
    const keys = ["by_price_band", "by_track", "by_stake_bracket"];
    return keys.some((k) => (m[k] || []).some((r) => r.hyp));
  }

  function breakdownRowsHaveHyp(rows) {
    return (rows || []).some((r) => r.hyp);
  }

  /** Main stats first, then the staked-only card. Not in parallel: each cold request makes TipBot grade every
   *  day through its single DB slot, and two at once made both 503 under load. Once the main request succeeds,
   *  TipBot's 30-minute per-day cache makes the staked request cheap. */
  async function reload() {
    if (!signedIn()) return;
    markStakedPending();
    try {
      await loadMainStats();
    } finally {
      if (signedIn()) loadStakedOnly();
    }
  }

  function markStakedPending() {
    state.stakedLoading = true;
    state.stakedNotLive = false;
    state.stakedError = "";
    renderStakedSection();
  }

  async function loadMainStats() {
    const from = effectiveFrom();
    const to = $("date-to").value || state.rangeTo;
    const err = validateRange(from, to);
    if (err) {
      state.loadError = err;
      renderStatus();
      return;
    }
    state.rangeFrom = from;
    state.rangeTo = to;
    syncRangeInputs();
    updatePresetChips();
    state.loadError = "";
    state.apiNotLive = false;
    state.notConfigured = false;
    $("dashboard").hidden = true;
    $("load-state").hidden = false;
    $("load-state").textContent = "Loading stats…";
    const result = await fetchModelStats(from, to, {});
    $("load-state").hidden = true;
    if (result.auth) return;
    if (result.notLive || result.notConfigured) {
      state.apiNotLive = !!result.notLive;
      state.notConfigured = !!result.notConfigured;
      state.data = null;
      renderStatus();
      $("dashboard").hidden = true;
      return;
    }
    if (!result.ok) {
      state.loadError = result.error || "Could not load stats.";
      state.data = null;
      renderStatus();
      return;
    }
    state.data = result.data;
    state.apiNotLive = false;
    // Top-level calendar[] (all three models per day); falls back to joining models.*.daily by date.
    state.joinedByDate = new Map(CAL.calendarDays(state.data).map((d) => [d.date, d]));
    state.calendarMonth = state.rangeTo.slice(0, 7);
    if (!state.allTime && state.data.range && state.data.range.from) {
      state.rangeFrom = state.data.range.from;
    }
    $("dashboard").hidden = false;
    renderAll();
  }

  function signOutAndShowGate() {
    setToken("");
    API.clearStatsCache();
    state.token = "";
    state.forbidden = false;
    state.notConfigured = false;
    state.data = null;
    state.stakedData = null;
    state.stakedNotLive = false;
    state.stakedError = "";
    state.bp = { loading: false, error: "", days: null, month: "" };
    state.gateMessage = "";
    state.apiNotLive = false;
    state.loadError = "";
    state.reconstructedAvailable = null;
    setView();
    renderStatus();
    $("dashboard").hidden = true;
  }

  function renderStatus() {
    const wrap = $("status-banner");
    const text = $("status-banner-text");
    const changeBtn = $("btn-banner-change-token");
    wrap.hidden = true;
    wrap.className = "banner status-banner";
    text.textContent = "";
    changeBtn.hidden = true;
    if (state.apiNotLive) {
      wrap.hidden = false;
      wrap.classList.add("info");
      text.textContent = UNAVAILABLE_MSG;
      changeBtn.hidden = false;
    } else if (state.notConfigured) {
      wrap.hidden = false;
      wrap.classList.add("info");
      text.textContent = NOT_CONFIGURED_MSG;
    } else if (state.loadError) {
      wrap.hidden = false;
      text.textContent = state.loadError;
    } else if (state.data && FMT.ungradedPicks(state.data.models) > 0) {
      wrap.hidden = false;
      wrap.classList.add("info");
      text.textContent = FMT.UNGRADED_MSG;
    }
  }

  function renderMeta() {
    $("generated-at").textContent = state.data ? "Generated " + melbourneTime(state.data.generated_at) + " (Melbourne)" : "";
    const dm = $("data-meta");
    dm.textContent = state.data && state.data.meta ? formatMetaBlock(state.data.meta) : "";
    dm.hidden = !dm.textContent;
    if (!state.data) {
      $("range-label").textContent = "";
      return;
    }
    const fromLbl = state.allTime ? "All time" : state.data.range.from;
    $("range-label").textContent = fromLbl + " → " + state.data.range.to;
  }

  function renderSummary() {
    const root = $("summary-cards");
    root.replaceChildren();
    for (const id of CFG.MODELS) {
      const s = state.data.models[id].summary;
      const card = document.createElement("article");
      card.className = "card model-card " + id;
      const name = document.createElement("p");
      name.className = "tag";
      name.textContent = CFG.MODEL_LABELS[id];
      const pl = document.createElement("p");
      pl.className = "stats-row";
      const plStrong = document.createElement("strong");
      plStrong.className = plClass(s.pl_units);
      plStrong.textContent = fmtPl(s.pl_units) + " u";
      pl.append("P&L ", plStrong);
      card.append(name, pl);
      if (s.hyp) {
        const hyp = document.createElement("p");
        hyp.className = "summary-hyp";
        hyp.textContent =
          "Flat 1u: " +
          fmtPl(s.hyp.pl_units) +
          "u · ROI " +
          FMT.formatPctWithN(s.hyp.roi_pct, FMT.hypSampleN(s.hyp, s.bets), { signed: true });
        card.append(hyp);
      }
      const counts = document.createElement("p");
      counts.className = "card-meta";
      counts.textContent = FMT.formatPicksStaked(s.picks, s.bets);
      card.append(counts);
      const row = document.createElement("div");
      row.className = "stats-row";
      row.append(
        textStat("Strike", FMT.formatPctWithN(s.strike_pct, s.bets)),
        textStat("ROI", FMT.formatPctWithN(s.roi_pct, s.bets, { signed: true })),
        textStat("Bets", String(s.bets)),
        textStat("Staked", fmt(s.staked_units) + " u")
      );
      card.append(row);
      if (FMT.isSmallSample(s.bets)) card.append(smallSampleTag());
      root.appendChild(card);
    }
  }

  function textStat(label, value) {
    const span = document.createElement("span");
    span.textContent = label + ": " + value;
    return span;
  }

  function modelStrokeColor(id) {
    if (id === "with_price") return "var(--m-with)";
    if (id === "without_price") return "var(--m-without)";
    return "var(--m-agree)";
  }

  function renderCumUnitsChart(svg, modelsRoot, options) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const primary = options && options.primary;
    const faintOthers = !!(options && options.faintOthers);
    const valueField =
      options && options.valueField === "hyp_cum_units" ? "hyp_cum_units" : "cum_units";
    const pointMap = (rows) =>
      (rows || [])
        .filter((d) => d.date)
        .map((d) => ({
          date: d.date,
          cum_units: Number.isFinite(d[valueField]) ? d[valueField] : 0,
        }));
    const series = CFG.MODELS.map((id) => {
      const parts = CAL.partitionDailyByReconstructed((modelsRoot[id] && modelsRoot[id].daily) || []);
      return { id, color: modelStrokeColor(id), points: pointMap(parts.frozen) };
    });
    if (options && options.includeReconstructed) {
      CFG.MODELS.forEach((id) => {
        const parts = CAL.partitionDailyByReconstructed((modelsRoot[id] && modelsRoot[id].daily) || []);
        series.push({
          id: id + "-recon",
          color: modelStrokeColor(id),
          dashed: true,
          points: pointMap(parts.reconstructed),
        });
      });
    }
    const allDates = [];
    const dateSet = new Set();
    series.forEach((s) => s.points.forEach((p) => { if (!dateSet.has(p.date)) { dateSet.add(p.date); allDates.push(p.date); } }));
    allDates.sort();
    if (!allDates.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", "8");
      t.setAttribute("y", "24");
      t.setAttribute("class", "chart-label");
      t.textContent = "No daily data in range.";
      svg.appendChild(t);
      return;
    }
    const w = 640;
    const h = 200;
    const pad = { l: 40, r: 12, t: 12, b: 28 };
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    let ymin = 0;
    let ymax = 0;
    series.forEach((s) => s.points.forEach((p) => {
      ymin = Math.min(ymin, p.cum_units);
      ymax = Math.max(ymax, p.cum_units);
    }));
    if (ymin === ymax) { ymin -= 1; ymax += 1; }
    const xAt = (i) => pad.l + (i / Math.max(allDates.length - 1, 1)) * (w - pad.l - pad.r);
    const yAt = (v) => pad.t + (1 - (v - ymin) / (ymax - ymin)) * (h - pad.t - pad.b);
    const zeroY = yAt(0);
    const zero = document.createElementNS("http://www.w3.org/2000/svg", "line");
    zero.setAttribute("x1", String(pad.l));
    zero.setAttribute("x2", String(w - pad.r));
    zero.setAttribute("y1", String(zeroY));
    zero.setAttribute("y2", String(zeroY));
    zero.setAttribute("stroke", "var(--line)");
    svg.appendChild(zero);
    series.forEach((s) => {
      const byDate = new Map(s.points.map((p) => [p.date, p.cum_units]));
      let pathStr = "";
      allDates.forEach((date, i) => {
        if (!byDate.has(date)) return;
        const v = byDate.get(date);
        const seg = xAt(i).toFixed(1) + " " + yAt(v).toFixed(1);
        pathStr += (pathStr ? " L " : "M ") + seg;
      });
      if (!pathStr) return;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathStr.trim());
      path.setAttribute("fill", "none");
      const isPrimary = !primary || primary === s.id;
      path.setAttribute("stroke", s.color);
      path.setAttribute("stroke-width", isPrimary && !s.dashed ? "2.5" : "1.2");
      path.setAttribute("opacity", s.dashed ? "0.7" : faintOthers && primary && !isPrimary ? "0.35" : "1");
      if (s.dashed) path.setAttribute("stroke-dasharray", "5 4");
      svg.appendChild(path);
    });
    const y0 = document.createElementNS("http://www.w3.org/2000/svg", "text");
    y0.setAttribute("x", "4");
    y0.setAttribute("y", String(pad.t + 4));
    y0.setAttribute("class", "chart-label");
    y0.textContent = fmt(ymax, 0);
    svg.appendChild(y0);
    const y1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
    y1.setAttribute("x", "4");
    y1.setAttribute("y", String(h - pad.b));
    y1.setAttribute("class", "chart-label");
    y1.textContent = fmt(ymin, 0);
    svg.appendChild(y1);
  }

  function renderBankrollChart() {
    const flat = state.bankrollMode === "flat";
    const showRecon = state.includeReconstructed && state.reconstructedAvailable === true;
    renderCumUnitsChart($("bankroll-chart"), state.data.models, {
      valueField: flat ? "hyp_cum_units" : "cum_units",
      includeReconstructed: showRecon,
    });
    const reconLegend = $("recon-chart-legend");
    if (reconLegend) {
      reconLegend.hidden = !showRecon;
      const text = $("recon-chart-legend-text");
      if (text) text.textContent = FMT.RECON_CHART_LABEL;
    }
  }

  async function loadStakedOnly() {
    if (!signedIn()) return;
    state.stakedLoading = true;
    state.stakedNotLive = false;
    state.stakedError = "";
    renderStakedSection();
    const to = DATES.todayMelbourneIso();
    const from = CFG.STAKED_ONLY_FROM;
    const result = await fetchModelStats(from, to, { stakedOnly: true });
    state.stakedLoading = false;
    if (result.auth) return;
    if (result.notLive || result.notConfigured) {
      if (result.notConfigured) state.notConfigured = true;
      state.stakedNotLive = true;
      state.stakedData = null;
      renderStakedSection();
      return;
    }
    if (!result.ok) {
      state.stakedError = result.error || "Could not load staked stats.";
      state.stakedData = null;
      renderStakedSection();
      return;
    }
    state.stakedData = result.data;
    state.stakedNotLive = false;
    state.stakedError = "";
    renderStakedSection();
  }

  function renderStakedSection() {
    const wrap = $("staked-section");
    if (!wrap) return;
    $("staked-load").hidden = !state.stakedLoading;
    const err = $("staked-error");
    const errText = $("staked-error-text");
    err.hidden = true;
    errText.textContent = "";
    if (state.stakedNotLive) {
      err.hidden = false;
      err.classList.add("info");
      errText.textContent = state.notConfigured ? NOT_CONFIGURED_MSG : UNAVAILABLE_MSG;
    } else if (state.stakedError) {
      err.hidden = false;
      err.classList.remove("info");
      errText.textContent = state.stakedError;
    }
    const body = $("staked-panel-body");
    const hasData = state.stakedData && !state.stakedNotLive && !state.stakedError;
    body.hidden = !hasData || state.stakedLoading;
    if (!hasData) {
      $("staked-empty").hidden = true;
      $("staked-chart").replaceChildren();
      return;
    }
    const model = state.stakedModel;
    const summary = state.stakedData.models[model].summary;
    document.querySelectorAll("[data-staked-model]").forEach((btn) => {
      btn.classList.toggle("on", btn.getAttribute("data-staked-model") === model);
    });
    const stats = $("staked-stats");
    stats.replaceChildren();
    const pl = document.createElement("strong");
    pl.className = plClass(summary.pl_units);
    pl.textContent = fmtPl(summary.pl_units) + " u";
    stats.append(
      "P&L ",
      pl,
      " · ROI " + FMT.formatPctWithN(summary.roi_pct, summary.bets, { signed: true }) + " · Bets " + summary.bets
    );
    if (summary.bets > 0) {
      stats.append(" · Strike " + FMT.formatPctWithN(summary.strike_pct, summary.bets));
    }
    if (FMT.isSmallSample(summary.bets)) {
      stats.append(" ");
      stats.append(smallSampleTag());
    }
    const empty = $("staked-empty");
    const chart = $("staked-chart");
    if (!summary.bets) {
      empty.textContent = summary.picks > 0 ? FMT.STAKED_UNGRADED_MSG : FMT.STAKED_EMPTY_MSG;
      empty.hidden = false;
      chart.hidden = true;
      chart.replaceChildren();
      return;
    }
    empty.hidden = true;
    chart.hidden = false;
    renderCumUnitsChart(chart, state.stakedData.models, { primary: model, faintOthers: true });
  }

  /** Breakdown field for a tab. Stake size = by_stake_bracket (2u/1u/0.5u/no bet). Threshold = by_threshold
   *  (9 fixed 7am win-chance bands) or by_min_threshold (cumulative "at or above" cuts). */
  function breakdownKey(tab, thresholdMode) {
    if (tab === "price_band") return "by_price_band";
    if (tab === "track") return "by_track";
    if (tab === "threshold") return thresholdMode === "min" ? "by_min_threshold" : "by_threshold";
    return "by_stake_bracket";
  }

  function renderBreakdown() {
    const model = state.breakdownModel;
    const tab = state.breakdownTab;
    const m = state.data.models[model];
    const isThreshold = tab === "threshold";
    const rows = m[breakdownKey(tab, state.thresholdMode)] || [];
    const tbody = $("breakdown-body");
    const head = $("breakdown-head");
    $("thresh-mode").hidden = !isThreshold;
    $("thresh-note").hidden = !isThreshold;
    document.querySelectorAll("[data-thresh-mode]").forEach((btn) => {
      btn.classList.toggle("on", btn.getAttribute("data-thresh-mode") === state.thresholdMode);
    });
    const showHyp = isThreshold || breakdownRowsHaveHyp(rows);
    head.replaceChildren();
    const headTr = document.createElement("tr");
    const cols = isThreshold
      ? ["Win chance", "Picks", "Bets", "Wins", "Strike %", "P&L u", "ROI %"]
      : ["Label", "Bets", "Wins", "Strike %", "P&L u", "ROI %"];
    cols.forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      headTr.append(th);
    });
    if (showHyp) {
      (isThreshold ? ["Flat n", "Flat strike %", "Flat P&L", "Flat ROI %"] : ["Flat P&L", "Flat ROI %"]).forEach((h) => {
        const th = document.createElement("th");
        th.textContent = h;
        headTr.append(th);
      });
    }
    head.append(headTr);
    tbody.replaceChildren();
    if (!rows.length) {
      $("breakdown-empty").hidden = false;
      $("breakdown-empty").textContent = isThreshold
        ? "No threshold rows yet. They arrive with the new TipBot stats."
        : "No rows in this breakdown.";
      return;
    }
    $("breakdown-empty").hidden = true;
    const fields = isThreshold
      ? ["label", "picks", "bets", "wins", "strike_pct", "pl_units", "roi_pct"]
      : ["label", "bets", "wins", "strike_pct", "pl_units", "roi_pct"];
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      if (isThreshold && !r.bets) tr.classList.add("row-nobet");
      fields.forEach((col) => {
        const td = document.createElement("td");
        if (col === "strike_pct") td.textContent = r.bets ? FMT.formatPctWithN(r[col], r.bets) : "—";
        else if (col === "roi_pct") td.textContent = r.bets ? FMT.formatPctWithN(r[col], r.bets, { signed: true }) : "—";
        else if (col === "pl_units") {
          td.textContent = r.bets ? fmtPl(r[col]) : "—";
          td.className = plClass(r[col]);
        } else td.textContent = String(r[col] == null ? 0 : r[col]);
        tr.appendChild(td);
      });
      if (showHyp) {
        const hp = r.hyp || {};
        const n = FMT.hypSampleN(hp, r.bets);
        if (isThreshold) {
          const tdN = document.createElement("td");
          tdN.textContent = String(hp.bets || 0);
          tr.append(tdN);
          const tdS = document.createElement("td");
          tdS.textContent = hp.bets ? FMT.formatPctWithN(hp.strike_pct, n) : "—";
          tr.append(tdS);
        }
        const tdPl = document.createElement("td");
        tdPl.textContent = fmtPl(hp.pl_units);
        tdPl.className = plClass(hp.pl_units);
        tr.append(tdPl);
        const tdRoi = document.createElement("td");
        tdRoi.textContent = FMT.formatPctWithN(hp.roi_pct, n, { signed: true });
        tr.append(tdRoi);
      }
      tbody.appendChild(tr);
    });
    document.querySelectorAll("[data-break-tab]").forEach((btn) => {
      btn.classList.toggle("on", btn.getAttribute("data-break-tab") === tab);
    });
    document.querySelectorAll("[data-break-model]").forEach((btn) => {
      btn.classList.toggle("on", btn.getAttribute("data-break-model") === model);
    });
  }

  function renderWeekday() {
    const model = state.weekdayModel;
    const rows = state.data.models[model].by_weekday || [];
    const tbody = $("weekday-body");
    const head = $("weekday-head");
    const showFlat = rows.some((r) => r.hyp_pl_units || r.hyp_roi_pct);
    head.replaceChildren();
    const headTr = document.createElement("tr");
    (showFlat
      ? ["Day", "Picks", "Bets", "Wins", "P&L u", "ROI %", "Flat u", "Flat ROI %"]
      : ["Day", "Picks", "Bets", "Wins", "P&L u", "ROI %"]
    ).forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      headTr.append(th);
    });
    head.append(headTr);
    tbody.replaceChildren();
    document.querySelectorAll("[data-weekday-model]").forEach((btn) => {
      btn.classList.toggle("on", btn.getAttribute("data-weekday-model") === model);
    });
    if (!rows.length) {
      $("weekday-empty").hidden = false;
      return;
    }
    $("weekday-empty").hidden = true;
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      if (CAL.isRacingWeekdayHighlight(r.label)) tr.classList.add("weekday-highlight");
      const labelTd = document.createElement("td");
      labelTd.textContent = r.label;
      if (CAL.isRacingWeekdayHighlight(r.label)) {
        const tag = document.createElement("span");
        tag.className = "meet-tag";
        tag.textContent = "meet";
        labelTd.append(tag);
      }
      tr.append(labelTd);
      [r.picks, r.bets, r.wins].forEach((v) => {
        const td = document.createElement("td");
        td.textContent = String(v);
        tr.append(td);
      });
      const plTd = document.createElement("td");
      plTd.textContent = fmtPl(r.pl_units);
      plTd.className = plClass(r.pl_units);
      tr.append(plTd);
      const roiTd = document.createElement("td");
      roiTd.textContent = FMT.formatPctWithN(r.roi_pct, r.bets, { signed: true });
      tr.append(roiTd);
      if (showFlat) {
        const hTd = document.createElement("td");
        hTd.textContent = fmtPl(r.hyp_pl_units);
        hTd.className = plClass(r.hyp_pl_units);
        tr.append(hTd);
        const hrTd = document.createElement("td");
        hrTd.textContent = FMT.formatPctWithN(
          r.hyp_roi_pct,
          FMT.hypSampleN(r.hyp, r.picks || r.bets),
          { signed: true }
        );
        tr.append(hrTd);
      }
      tbody.appendChild(tr);
    });
  }

  function renderRecent() {
    const model = $("recent-model").value;
    const mblock = state.data.models[model];
    const recent = mblock.recent;
    const showHyp = modelShowsHyp(mblock);
    const head = $("recent-head");
    head.replaceChildren();
    const headTr = document.createElement("tr");
    (showHyp
      ? ["Date", "Track", "R", "Horse", "Price", "Stake", "Result", "P&L", "Flat 1u"]
      : ["Date", "Track", "R", "Horse", "Price", "Stake", "Result", "P&L"]
    ).forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      headTr.append(th);
    });
    head.append(headTr);
    const strip = $("recent-strip");
    strip.replaceChildren();
    recent.forEach((r) => {
      const dot = document.createElement("span");
      dot.className = r.result;
      dot.title = r.result;
      strip.appendChild(dot);
    });
    const tbody = $("recent-body");
    tbody.replaceChildren();
    if (!recent.length) {
      $("recent-empty").hidden = false;
      return;
    }
    $("recent-empty").hidden = true;
    recent.forEach((r) => {
      const noBet = !r.stake_units;
      const tr = document.createElement("tr");
      if (noBet) tr.classList.add("no-bet");
      if (r.reconstructed) tr.classList.add("reconstructed");
      const dateTd = document.createElement("td");
      dateTd.append(r.date);
      if (r.reconstructed) {
        const tag = document.createElement("span");
        tag.className = "recon-tag";
        tag.textContent = "reconstructed";
        dateTd.append(tag);
      }
      tr.appendChild(dateTd);
      const cols = [
        r.track,
        String(r.race_no),
        r.horse,
        fmt(r.price, 2),
        noBet ? "0u" : fmt(r.stake_units, 1),
      ];
      cols.forEach((c, i) => {
        const td = document.createElement("td");
        td.textContent = c;
        if (i === 4 && noBet) td.classList.add("stake-zero");
        tr.appendChild(td);
      });
      const resTd = document.createElement("td");
      resTd.textContent = noBet ? "no bet" : r.result;
      resTd.className = noBet ? "stake-zero" : "result-" + r.result;
      tr.appendChild(resTd);
      const plTd = document.createElement("td");
      plTd.textContent = noBet ? "—" : fmtPl(r.pl_units);
      if (!noBet) plTd.className = plClass(r.pl_units);
      tr.appendChild(plTd);
      if (showHyp) {
        const hTd = document.createElement("td");
        hTd.textContent = fmtPl(r.hyp_pl_units);
        hTd.className = plClass(r.hyp_pl_units);
        tr.appendChild(hTd);
      }
      tbody.appendChild(tr);
    });
  }

  function monthTitle(ym) {
    const { y, m } = CAL.parseYm(ym);
    return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m - 1, 1))
    );
  }

  function modelMiniLabel(id) {
    if (id === "with_price") return "W";
    if (id === "without_price") return "WO";
    return "A";
  }

  function miniCellText(slice) {
    if (!slice || !slice.bets) return "";
    return fmtPl(slice.pl_units) + " " + slice.wins + "/" + slice.bets;
  }

  function renderCalendar() {
    if (!state.data || !state.joinedByDate) return;
    const ym = state.calendarMonth || state.rangeTo.slice(0, 7);
    $("cal-month-label").textContent = monthTitle(ym);
    const prev = CAL.ymAdd(ym, -1);
    const next = CAL.ymAdd(ym, 1);
    $("cal-prev").disabled = !CAL.monthOverlapsRange(prev, state.rangeFrom, state.rangeTo);
    $("cal-next").disabled = !CAL.monthOverlapsRange(next, state.rangeFrom, state.rangeTo);
    const grid = $("cal-grid");
    grid.replaceChildren();
    const cells = CAL.buildMonthGrid(ym);
    const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    dow.forEach((d) => {
      const h = document.createElement("div");
      h.className = "cal-dow";
      h.textContent = d;
      grid.appendChild(h);
    });
    cells.forEach((iso) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cal-day";
      if (!iso) {
        cell.classList.add("cal-pad");
        cell.disabled = true;
        cell.tabIndex = -1;
        grid.appendChild(cell);
        return;
      }
      const inRange = CAL.dateInRange(iso, state.rangeFrom, state.rangeTo);
      const dayNum = iso.slice(8, 10).replace(/^0/, "");
      cell.dataset.date = iso;
      if (!inRange) cell.classList.add("cal-out");
      const num = document.createElement("span");
      num.className = "cal-num";
      num.textContent = dayNum;
      cell.appendChild(num);
      const day = state.joinedByDate.get(iso);
      if (day && day.reconstructed && inRange) {
        cell.classList.add("cal-reconstructed");
        const rec = document.createElement("span");
        rec.className = "cal-recon-tag";
        rec.textContent = "reconstructed";
        cell.appendChild(rec);
      }
      if (day && inRange) {
        const hasAny = CFG.MODELS.some((id) => day[id] && (day[id].bets || day[id].picks));
        if (hasAny) {
          const models = document.createElement("div");
          models.className = "cal-models";
          CFG.MODELS.forEach((id) => {
            const slice = day[id];
            const row = document.createElement("div");
            row.className = "cal-mini";
            if (!slice || !slice.bets) {
              row.classList.add("neutral");
              const lab = document.createElement("span");
              lab.className = "cal-lab";
              lab.textContent = modelMiniLabel(id);
              const val = document.createElement("span");
              val.className = "cal-val";
              val.textContent = "—";
              row.append(lab, val);
              models.appendChild(row);
              return;
            }
            row.classList.add(CAL.plTone(slice.pl_units, slice.bets));
            const lab = document.createElement("span");
            lab.className = "cal-lab";
            lab.textContent = modelMiniLabel(id);
            const val = document.createElement("span");
            val.className = "cal-val";
            const pl = document.createElement("span");
            pl.className = "cal-pl";
            pl.textContent = fmtPl(slice.pl_units);
            const wl = document.createElement("span");
            wl.className = "cal-wl";
            wl.textContent = " " + slice.wins + "/" + slice.bets;
            val.append(pl, wl);
            row.title = CFG.MODEL_LABELS[id] + ": " + miniCellText(slice) + "u";
            row.append(lab, val);
            models.appendChild(row);
          });
          cell.appendChild(models);
          cell.classList.add("cal-has-data");
        }
      }
      if (inRange) {
        cell.addEventListener("click", () => openDaySheet(iso));
      } else {
        cell.disabled = true;
      }
      grid.appendChild(cell);
    });
    const legend = $("cal-recon-legend");
    if (legend) {
      const show = CFG.MODELS && state.joinedByDate
        ? [...state.joinedByDate.values()].some((d) => d.reconstructed && String(d.date).slice(0, 7) === ym)
        : false;
      legend.hidden = !show;
    }
  }

  function openDaySheet(date) {
  const day = state.joinedByDate.get(date) || {
      date,
      with_price: null,
      without_price: null,
      agree: null,
    };
    $("day-sheet-title").textContent = date;
    const body = $("day-sheet-body");
    body.replaceChildren();
    if (day.reconstructed) {
      const rec = document.createElement("p");
      rec.className = "hint recon-label";
      rec.textContent = "Reconstructed";
      body.appendChild(rec);
    }
    CFG.MODELS.forEach((id) => {
      const slice = day[id];
      const card = document.createElement("div");
      card.className = "day-model card";
      const h = document.createElement("h3");
      h.textContent = CFG.MODEL_LABELS[id];
      card.appendChild(h);
      if (!slice || (!slice.bets && !slice.picks)) {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = "No picks this day.";
        card.appendChild(p);
      } else {
        const strike = CAL.dailyStrikePct(slice.bets, slice.wins);
        const stats = document.createElement("p");
        stats.className = "stats-row sheet-stats";
        const parts = [
          "Picks " + (slice.picks || 0),
          "Bets " + slice.bets,
          "Wins " + slice.wins,
        ];
        if (slice.bets) parts.push("Losses " + (slice.losses || 0));
        if (slice.bets) parts.push("Strike " + fmtPct(strike));
        stats.append(parts.join(" · "));
        card.appendChild(stats);
        const plLine = document.createElement("p");
        plLine.className = "stats-row";
        plLine.append("Real ");
        const strong = document.createElement("strong");
        strong.className = plClass(slice.pl_units);
        strong.textContent = fmtPl(slice.pl_units) + "u";
        plLine.append(strong);
        if (slice.hyp_pl_units || slice.bets || slice.hyp_bets) {
          plLine.append(" · Flat 1u ");
          const hyp = document.createElement("strong");
          hyp.className = plClass(slice.hyp_pl_units);
          hyp.textContent = fmtPl(slice.hyp_pl_units) + "u";
          plLine.append(hyp);
          if (slice.hyp_bets) plLine.append(" (" + (slice.hyp_wins || 0) + "/" + slice.hyp_bets + " won)");
        }
        card.appendChild(plLine);
      }
      const recents = (state.data.models[id].recent || []).filter((r) => r.date === date);
      if (recents.length) {
        const sub = document.createElement("p");
        sub.className = "muted";
        sub.textContent = "Bets (" + recents.length + ")";
        card.appendChild(sub);
        const list = document.createElement("ul");
        list.className = "day-bets";
        recents.forEach((r) => {
          const li = document.createElement("li");
          li.textContent =
            "R" +
            r.race_no +
            " " +
            r.horse +
            " @ " +
            fmt(r.price, 2) +
            " · " +
            r.result +
            " · " +
            fmtPl(r.pl_units) +
            "u" +
            (r.reconstructed ? " · reconstructed" : "");
          list.appendChild(li);
        });
        card.appendChild(list);
      }
      body.appendChild(card);
    });
    $("day-sheet").hidden = false;
    document.body.classList.add("sheet-open");
  }

  function closeDaySheet() {
    $("day-sheet").hidden = true;
    document.body.classList.remove("sheet-open");
  }

  function renderHeadToHead() {
    const hh = state.data.head_to_head;
    const tbody = $("h2h-body");
    tbody.replaceChildren();
    hh.days.forEach((d) => {
      const tr = document.createElement("tr");
      if (d.reconstructed) tr.classList.add("reconstructed");
      [d.date, fmtPl(d.with_price), fmtPl(d.without_price), fmtPl(d.agree)].forEach((c, i) => {
        const td = document.createElement("td");
        if (i === 0 && d.reconstructed) {
          td.append(c);
          const tag = document.createElement("span");
          tag.className = "recon-tag";
          tag.textContent = "reconstructed";
          td.append(tag);
        } else {
          td.textContent = c;
        }
        if (i > 0) td.className = plClass([d.with_price, d.without_price, d.agree][i - 1]);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    const dr = hh.disagree_races;
    $("disagree-summary").textContent =
      "Disagree races: " + dr.count + " · with_price won " + dr.with_wins + " · without_price won " + dr.without_wins;
  }

  function renderAll() {
    renderStatus();
    renderMeta();
    renderSummary();
    renderCalendar();
    renderBankrollChart();
    renderBreakdown();
    renderWeekday();
    renderRecent();
    renderHeadToHead();
    document.querySelectorAll("[data-bank-mode]").forEach((btn) => {
      btn.classList.toggle("on", btn.getAttribute("data-bank-mode") === state.bankrollMode);
    });
  }

  function updatePresetChips() {
    document.querySelectorAll("[data-preset]").forEach((btn) => {
      const p = btn.getAttribute("data-preset");
      if (p === "all") {
        btn.classList.toggle("on", state.allTime);
        return;
      }
      if (state.allTime) {
        btn.classList.toggle("on", false);
        return;
      }
      const to = state.rangeTo;
      const from = state.rangeFrom;
      if (!to || !from || from === "all") {
        btn.classList.toggle("on", false);
        return;
      }
      const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
      btn.classList.toggle("on", Number(p) === days);
    });
  }

  function applyAllTime() {
    state.allTime = true;
    state.rangeFrom = "all";
    const to = DATES.todayMelbourneIso();
    state.rangeTo = to;
    $("date-to").value = to;
    syncRangeInputs();
    updatePresetChips();
    reload();
  }

  function applyPreset(days) {
    state.allTime = false;
    const to = DATES.todayMelbourneIso();
    const from = DATES.addCalendarDays(to, -(days - 1));
    state.rangeFrom = from;
    state.rangeTo = to;
    $("date-from").value = from;
    $("date-to").value = to;
    syncRangeInputs();
    updatePresetChips();
    reload();
  }

  function bindEvents() {
    $("btn-signout").addEventListener("click", signOutAndShowGate);
    $("btn-discord").addEventListener("click", () => {
      // 403 "Sign in again": drop only this page's key so the fresh session is used; a shared Black Book token stays.
      if (state.forbidden) API.clearPrimaryToken(localStorage);
    });
    document.querySelectorAll("[data-thresh-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.thresholdMode = btn.getAttribute("data-thresh-mode");
        renderBreakdown();
      });
    });
    $("btn-banner-change-token").addEventListener("click", signOutAndShowGate);
    $("btn-apply-range").addEventListener("click", () => {
      if (!state.allTime) state.rangeFrom = $("date-from").value;
      state.rangeTo = $("date-to").value;
      reload();
    });
    const reconToggle = $("toggle-reconstructed");
    if (reconToggle) {
      reconToggle.checked = state.includeReconstructed;
      reconToggle.addEventListener("change", () => {
        state.includeReconstructed = reconToggle.checked;
        setIncludeReconstructed(state.includeReconstructed);
        reload();
      });
    }
    $("date-from").addEventListener("change", () => {
      state.allTime = false;
      syncRangeInputs();
      updatePresetChips();
    });
    document.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = btn.getAttribute("data-preset");
        if (p === "all") applyAllTime();
        else applyPreset(Number(p));
      });
    });
    document.querySelectorAll("[data-bank-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.bankrollMode = btn.getAttribute("data-bank-mode");
        renderBankrollChart();
        document.querySelectorAll("[data-bank-mode]").forEach((b) => {
          b.classList.toggle("on", b.getAttribute("data-bank-mode") === state.bankrollMode);
        });
      });
    });
    document.querySelectorAll("[data-weekday-model]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.weekdayModel = btn.getAttribute("data-weekday-model");
        renderWeekday();
      });
    });
    document.querySelectorAll("[data-break-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.breakdownTab = btn.getAttribute("data-break-tab");
        renderBreakdown();
      });
    });
    document.querySelectorAll("[data-break-model]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.breakdownModel = btn.getAttribute("data-break-model");
        renderBreakdown();
      });
    });
    document.querySelectorAll("[data-staked-model]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.stakedModel = btn.getAttribute("data-staked-model");
        renderStakedSection();
      });
    });
    $("recent-model").addEventListener("change", renderRecent);
    $("cal-prev").addEventListener("click", () => {
      const prev = CAL.ymAdd(state.calendarMonth, -1);
      if (CAL.monthOverlapsRange(prev, state.rangeFrom, state.rangeTo)) {
        state.calendarMonth = prev;
        renderCalendar();
      }
    });
    $("cal-next").addEventListener("click", () => {
      const next = CAL.ymAdd(state.calendarMonth, 1);
      if (CAL.monthOverlapsRange(next, state.rangeFrom, state.rangeTo)) {
        state.calendarMonth = next;
        renderCalendar();
      }
    });
    $("day-sheet-close").addEventListener("click", closeDaySheet);
    $("day-sheet-backdrop").addEventListener("click", closeDaySheet);
  }


  /* ---------- Best pick of the day + ladder (independent of the main stats requests) ---------- */

  function bestPicksRange() {
    const to = DATES.todayMelbourneIso();
    const floor = DATES.addCalendarDays(to, -364);
    const from = CFG.BEST_PICKS_FROM > floor ? CFG.BEST_PICKS_FROM : floor;
    return { from: from > to ? to : from, to };
  }

  /** GET /api/model-stats/best-picks. Any failure only shows a message in this section. */
  async function loadBestPicks() {
    if (!signedIn() || !BP) return;
    state.bp.loading = true;
    state.bp.error = "";
    renderBestPicks();
    const { from, to } = bestPicksRange();
    let days = null;
    let error = "";
    if (isDemoMode()) {
      days = BP.normaliseBestPicks(BP.demoBestPicks(from, to));
    } else {
      let res;
      try {
        res = await API.requestModelStats(API.buildBestPicksUrl(CFG.API_BASE, from, to), state.token);
      } catch (e) {
        res = { kind: "error", data: {} };
      }
      if (res.kind === "signin") { state.bp.loading = false; handleUnauthorised(); return; }
      if (res.kind === "forbidden") { state.bp.loading = false; handleForbidden(); return; }
      if (res.kind === "ok") days = BP.normaliseBestPicks(res.data);
      else error = BP_UNAVAILABLE_MSG;
    }
    state.bp.loading = false;
    state.bp.error = error;
    state.bp.days = error ? null : days;
    if (days && !state.bp.month) {
      const last = days.length ? days[days.length - 1].date : to;
      state.bp.month = last.slice(0, 7);
    }
    renderBestPicks();
  }

  function bpDayMap() {
    return new Map((state.bp.days || []).map((d) => [d.date, d]));
  }

  function bpTone(pick) {
    if (!pick) return "bp-none";
    if (pick.result === "won") return "bp-won";
    if (pick.result === "lost") return "bp-lost";
    if (pick.result === "pending") return "bp-pending";
    return "bp-void";
  }

  function fmtPrice(p) {
    return Number.isFinite(p) ? "@" + p.toFixed(2) : "";
  }

  function fmtMoney(n) {
    if (!Number.isFinite(n)) return "—";
    const sign = n < 0 ? "-" : "";
    return sign + "$" + Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function shortDate(iso) {
    const p = String(iso).split("-").map(Number);
    return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(p[0], p[1] - 1, p[2]))
    );
  }

  function resultLabel(code) {
    return { won: "Won", lost: "Lost", scratched: "Scratched", abandoned: "Abandoned", pending: "Pending", none: "No pick" }[code] || code;
  }

  function renderBestPicks() {
    const section = $("bestpick-section");
    if (!section) return;
    $("bp-load").hidden = !state.bp.loading;
    const err = $("bp-error");
    err.hidden = !state.bp.error;
    $("bp-error-text").textContent = state.bp.error || "";
    const has = !!state.bp.days && !state.bp.error;
    $("bp-body").hidden = !has || state.bp.loading;
    $("ladder-section").hidden = !has || state.bp.loading;
    if (!has) return;
    if (!state.bp.days.some((d) => d.pick)) {
      err.hidden = false;
      $("bp-error-text").textContent = "No best picks yet in this range.";
    }
    renderBpCalendar();
    renderLadder();
  }

  function renderBpCalendar() {
    const days = state.bp.days || [];
    const { from, to } = bestPicksRange();
    const ym = state.bp.month || to.slice(0, 7);
    $("bp-month-label").textContent = monthTitle(ym);
    $("bp-prev").disabled = !CAL.monthOverlapsRange(CAL.ymAdd(ym, -1), from, to);
    $("bp-next").disabled = !CAL.monthOverlapsRange(CAL.ymAdd(ym, 1), from, to);
    const map = bpDayMap();
    const grid = $("bp-grid");
    grid.replaceChildren();
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((d) => {
      const h = document.createElement("div");
      h.className = "cal-dow";
      h.textContent = d;
      grid.appendChild(h);
    });
    CAL.buildMonthGrid(ym).forEach((iso) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cal-day bp-day";
      if (!iso) {
        cell.classList.add("cal-pad");
        cell.disabled = true;
        cell.tabIndex = -1;
        grid.appendChild(cell);
        return;
      }
      const num = document.createElement("span");
      num.className = "cal-num";
      num.textContent = iso.slice(8, 10).replace(/^0/, "");
      cell.appendChild(num);
      cell.dataset.date = iso;
      const day = map.get(iso);
      const inRange = CAL.dateInRange(iso, from, to);
      if (day && day.pick) {
        const p = day.pick;
        cell.classList.add("cal-has-data", bpTone(p));
        const horse = document.createElement("span");
        horse.className = "bp-horse";
        horse.textContent = p.horse;
        const price = document.createElement("span");
        price.className = "bp-price";
        price.textContent = fmtPrice(p.price);
        cell.append(horse, price);
        cell.title = p.horse + " " + fmtPrice(p.price) + " · " + resultLabel(p.result);
        cell.addEventListener("click", () => openBestPickSheet(iso));
      } else if (day && inRange) {
        cell.classList.add("bp-none");
        const none = document.createElement("span");
        none.className = "bp-price";
        none.textContent = "no pick";
        cell.appendChild(none);
        cell.addEventListener("click", () => openBestPickSheet(iso));
      } else {
        if (!inRange) cell.classList.add("cal-out");
        cell.disabled = true;
      }
      grid.appendChild(cell);
    });
  }

  function sheetLine(label, value, cls) {
    const p = document.createElement("p");
    p.className = "stats-row bp-line";
    const l = document.createElement("span");
    l.className = "muted";
    l.textContent = label + " ";
    const v = document.createElement("strong");
    if (cls) v.className = cls;
    v.textContent = value;
    p.append(l, v);
    return p;
  }

  function openBestPickSheet(date) {
    const day = bpDayMap().get(date);
    $("day-sheet-title").textContent = "Best pick · " + shortDate(date);
    const body = $("day-sheet-body");
    body.replaceChildren();
    const card = document.createElement("div");
    card.className = "day-model card";
    if (!day || !day.pick) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "No best pick this day.";
      card.appendChild(p);
    } else {
      const p = day.pick;
      const h = document.createElement("h3");
      h.textContent = p.horse;
      card.appendChild(h);
      const race = [p.track, Number.isFinite(p.race_no) ? "R" + p.race_no : ""].filter(Boolean).join(" ");
      card.appendChild(sheetLine("Race", race || "—"));
      const stage = BP.stageLabel(p.stage);
      const priceLine = sheetLine("Price", Number.isFinite(p.price) ? p.price.toFixed(2) : "—");
      if (stage) {
        const note = document.createElement("span");
        note.className = "muted bp-stage";
        note.textContent = " " + stage;
        priceLine.appendChild(note);
      }
      card.appendChild(priceLine);
      card.appendChild(sheetLine("Win chance", Number.isFinite(p.p_win) ? fmtPct(p.p_win * 100) : "—"));
      const tone = p.result === "won" ? "pos" : p.result === "lost" ? "neg" : "";
      card.appendChild(sheetLine("Result", resultLabel(p.result), tone));
      if (Number.isFinite(p.stake_units)) card.appendChild(sheetLine("Stake", p.stake_units + "u"));
      card.appendChild(sheetLine("P/L", Number.isFinite(p.pl_units) ? fmtPl(p.pl_units) + "u" : "—", plClass(p.pl_units)));
      if (p.model) card.appendChild(sheetLine("Model", CFG.MODEL_LABELS[p.model] || p.model));
    }
    body.appendChild(card);
    $("day-sheet").hidden = false;
    document.body.classList.add("sheet-open");
  }

  function readLadderPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(LADDER_KEY) || "null");
      if (raw && typeof raw === "object") {
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw.start || "")) state.ladder.start = raw.start;
        const st = Number(raw.stake);
        if (Number.isFinite(st) && st > 0) state.ladder.stake = st;
        if (BP.LOSS_RULES.includes(raw.onLoss)) state.ladder.onLoss = raw.onLoss;
      }
    } catch (e) { /* ignore */ }
  }

  function saveLadderPrefs() {
    try { localStorage.setItem(LADDER_KEY, JSON.stringify(state.ladder)); } catch (e) { /* ignore */ }
  }

  function summaryTile(label, value, cls) {
    const d = document.createElement("div");
    d.className = "card summary-card ladder-tile";
    const l = document.createElement("p");
    l.className = "muted";
    l.textContent = label;
    const v = document.createElement("p");
    v.className = "ladder-val" + (cls ? " " + cls : "");
    v.textContent = value;
    d.append(l, v);
    return d;
  }

  function renderLadder() {
    const days = state.bp.days || [];
    const earliest = BP.earliestPickDate(days);
    const startInput = $("ladder-start");
    const start = state.ladder.start || earliest;
    startInput.value = start;
    if (earliest) startInput.min = days[0].date;
    if (days.length) startInput.max = days[days.length - 1].date;
    $("ladder-stake").value = String(state.ladder.stake);
    document.querySelectorAll("[data-ladder-loss]").forEach((b) => {
      b.classList.toggle("on", b.getAttribute("data-ladder-loss") === state.ladder.onLoss);
    });
    $("ladder-loss-rule").textContent = LADDER_LOSS_TEXT[state.ladder.onLoss];
    const r = BP.computeLadder(days, { startDate: start, stake: state.ladder.stake, onLoss: state.ladder.onLoss });
    const sum = $("ladder-summary");
    sum.replaceChildren(
      summaryTile("Current bank", fmtMoney(r.currentBank)),
      summaryTile("Net profit", (r.netProfit > 0 ? "+" : "") + fmtMoney(r.netProfit), plClass(r.netProfit)),
      summaryTile("Cash in", fmtMoney(r.cashIn) + (r.laddersStarted > 1 ? " (" + r.laddersStarted + " ladders)" : "")),
      summaryTile("Peak bank", fmtMoney(r.peakBank)),
      summaryTile("Longest win streak", String(r.longestWinStreak)),
      summaryTile(r.onLoss === "stop" ? "Status" : "Resets", r.onLoss === "stop" ? (r.busted ? "Busted" : "Alive") : String(r.resets), r.busted ? "neg" : "")
    );
    if (r.awaitingNewLadder) {
      sum.appendChild(summaryTile("Next pick", "New ladder at " + fmtMoney(r.stake)));
    }
    const tbody = $("ladder-body");
    tbody.replaceChildren();
    $("ladder-empty").hidden = r.rows.length > 0;
    r.rows.slice().reverse().forEach((row) => {
      const tr = document.createElement("tr");
      tr.className = "ladder-row lr-" + row.result + (row.stake == null ? " row-nobet" : "");
      const cells = [
        shortDate(row.date),
        row.horse || "—",
        Number.isFinite(row.price) ? row.price.toFixed(2) : "—",
        row.stake != null ? fmtMoney(row.stake) : "—",
        ladderResultText(row),
        row.bankAfter != null ? fmtMoney(row.bankAfter) : "—",
      ];
      cells.forEach((txt, i) => {
        const td = document.createElement("td");
        td.textContent = txt;
        if (i === 4) td.className = row.result === "won" ? "pos" : row.result === "lost" ? "neg" : "";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  /** Short result text for the 390px table; the full rule is stated above the table. */
  function ladderResultText(row) {
    if (row.note === "stopped") return "Not bet (stopped)";
    if (row.result === "none") return "No pick · carry";
    if (row.result === "pending") return "Pending";
    if (row.stake == null) return resultLabel(row.result) + " · carry";
    if (row.result === "lost") return row.note === "ladder busted" ? "Lost · busted" : "Lost · reset";
    return resultLabel(row.result);
  }

  function bindBestPickEvents() {
    if (!$("bestpick-section")) return;
    $("bp-prev").addEventListener("click", () => {
      state.bp.month = CAL.ymAdd(state.bp.month || bestPicksRange().to.slice(0, 7), -1);
      renderBpCalendar();
    });
    $("bp-next").addEventListener("click", () => {
      state.bp.month = CAL.ymAdd(state.bp.month || bestPicksRange().to.slice(0, 7), 1);
      renderBpCalendar();
    });
    $("ladder-start").addEventListener("change", (e) => {
      state.ladder.start = /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? e.target.value : "";
      saveLadderPrefs();
      renderLadder();
    });
    $("ladder-stake").addEventListener("change", (e) => {
      const v = Number(e.target.value);
      state.ladder.stake = Number.isFinite(v) && v > 0 ? BP.round2(v) : 20;
      saveLadderPrefs();
      renderLadder();
    });
    document.querySelectorAll("[data-ladder-loss]").forEach((b) => {
      b.addEventListener("click", () => {
        state.ladder.onLoss = b.getAttribute("data-ladder-loss");
        saveLadderPrefs();
        renderLadder();
      });
    });
  }

  /* ---------- HorsePicks AI Hybrid tab (lazy; independent of the main stats and best-pick requests) ---------- */

  function hybridPicksRange() {
    const to = DATES.todayMelbourneIso();
    const from = CFG.HYBRID_PICKS_FROM || ""; // empty from = all history
    return { from, to };
  }

  /** Switch the signed-in page between Model stats and HorsePicks AI Hybrid. Hybrid is fetched only when this tab is opened. */
  function setPageTab(tab) {
    state.pageTab = tab === "hybrid" ? "hybrid" : "models";
    const onHybrid = state.pageTab === "hybrid";
    document.querySelectorAll("[data-page-tab]").forEach((btn) => {
      const on = btn.getAttribute("data-page-tab") === state.pageTab;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    if ($("models-view")) $("models-view").hidden = onHybrid;
    if ($("hybrid-view")) $("hybrid-view").hidden = !onHybrid;
    if (!onHybrid) return;
    const shouldFetch = !state.hy.loading && (!state.hy.fetched || (state.hy.error && !state.hy.days));
    if (shouldFetch) loadHybridPicks();
    else renderHybrid();
  }

  /** GET /api/model-stats/hybrid-picks. Any failure only shows a message in this tab. */
  async function loadHybridPicks() {
    if (!signedIn() || !HY) return;
    state.hy.loading = true;
    state.hy.error = "";
    renderHybrid();
    const { from, to } = hybridPicksRange();
    let days = null;
    let error = "";
    if (isDemoMode()) {
      days = HY.adaptHybridPayload(HY.demoHybridPicks(from, to)).days;
    } else {
      let res;
      try {
        res = await API.requestModelStats(API.buildHybridPicksUrl(CFG.API_BASE, from, to), state.token);
      } catch (e) {
        res = { kind: "error", data: {} };
      }
      if (res.kind === "signin") { state.hy.loading = false; handleUnauthorised(); return; }
      if (res.kind === "forbidden") { state.hy.loading = false; handleForbidden(); return; }
      if (res.kind === "ok") days = HY.adaptHybridPayload(res.data).days;
      else error = HY_UNAVAILABLE_MSG;
    }
    state.hy.loading = false;
    state.hy.fetched = true;
    state.hy.error = error;
    state.hy.days = error ? null : days;
    if (days && !state.hy.month) {
      const last = days.length ? days[days.length - 1].date : to;
      state.hy.month = last.slice(0, 7);
    }
    renderHybrid();
  }

  function hyDayMap() {
    return new Map((state.hy.days || []).map((d) => [d.date, d]));
  }

  function renderHybrid() {
    const section = $("hybrid-section");
    if (!section) return;
    $("hy-load").hidden = !state.hy.loading;
    const err = $("hy-error");
    err.hidden = !state.hy.error;
    $("hy-error-text").textContent = state.hy.error || "";
    const has = !!state.hy.days && !state.hy.error;
    $("hy-body").hidden = !has || state.hy.loading;
    if (!has) return;
    if (!state.hy.days.some((d) => d.picks && d.picks.length)) {
      err.hidden = false;
      $("hy-error-text").textContent = "No hybrid picks yet in this range.";
    }
    renderHybridTotals();
    renderHybridCalendar();
  }

  function renderHybridTotals() {
    const days = state.hy.days || [];
    const t = HY.computeHybridTotals(days);
    $("hy-totals").replaceChildren(
      summaryTile("Record", t.wins + "\u2013" + t.losses),
      summaryTile("Net units", fmtPl(t.net_units) + "u", plClass(t.net_units)),
      summaryTile("ROI", t.roi_pct == null ? "\u2014" : fmtPct(t.roi_pct)),
      summaryTile("n", String(t.n))
    );
    const box = $("hy-highlights");
    box.replaceChildren();
    box.append(
      hybridCallout("best", "Best day", t.bestDay),
      hybridCallout("worst", "Worst day", t.worstDay)
    );
  }

  function hybridCallout(kind, label, entry) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hy-callout hy-" + kind;
    const l = document.createElement("span");
    l.className = "muted";
    l.textContent = label;
    const v = document.createElement("strong");
    if (entry) {
      v.className = plClass(entry.pl_units);
      v.textContent = shortDate(entry.date) + " \u00b7 " + fmtPl(entry.pl_units) + "u";
      btn.addEventListener("click", () => openHybridDay(entry.date));
    } else {
      v.textContent = "\u2014";
      btn.disabled = true;
    }
    btn.append(l, v);
    return btn;
  }

  function renderHybridCalendar() {
    const days = state.hy.days || [];
    const today = DATES.todayMelbourneIso();
    const span = HY.dataRange(days, today);
    const from = span.from || today;
    const to = span.to && span.to > today ? span.to : today;
    const ym = state.hy.month || to.slice(0, 7);
    $("hy-month-label").textContent = monthTitle(ym);
    $("hy-prev").disabled = !CAL.monthOverlapsRange(CAL.ymAdd(ym, -1), from, to);
    $("hy-next").disabled = !CAL.monthOverlapsRange(CAL.ymAdd(ym, 1), from, to);
    const map = hyDayMap();
    const grid = $("hy-grid");
    grid.replaceChildren();
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((d) => {
      const h = document.createElement("div");
      h.className = "cal-dow";
      h.textContent = d;
      grid.appendChild(h);
    });
    CAL.buildMonthGrid(ym).forEach((iso) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cal-day bp-day";
      if (!iso) {
        cell.classList.add("cal-pad");
        cell.disabled = true;
        cell.tabIndex = -1;
        grid.appendChild(cell);
        return;
      }
      const num = document.createElement("span");
      num.className = "cal-num";
      num.textContent = iso.slice(8, 10).replace(/^0/, "");
      cell.appendChild(num);
      cell.dataset.date = iso;
      const day = map.get(iso);
      const inRange = CAL.dateInRange(iso, from, to);
      if (day && day.picks && day.picks.length) {
        cell.classList.add("cal-has-data", HY.dayTone(day));
        const pl = document.createElement("span");
        pl.className = "hy-pl bp-price";
        if ((day.wins || 0) + (day.losses || 0) > 0) pl.textContent = fmtPl(day.pl_units);
        else if (day.pending > 0) pl.textContent = "pend";
        else pl.textContent = "scr";
        cell.appendChild(pl);
        const n = day.picks.length;
        cell.title = shortDate(iso) + " \u00b7 " + (fmtPl(day.pl_units) + "u") + " \u00b7 " + n + (n === 1 ? " pick" : " picks");
        cell.addEventListener("click", () => openHybridDay(iso));
      } else {
        if (!inRange) cell.classList.add("cal-out");
        cell.disabled = true;
      }
      grid.appendChild(cell);
    });
  }

  function openHybridDay(date) {
    const ym = String(date || "").slice(0, 7);
    if (ym && state.hy.month !== ym) {
      state.hy.month = ym;
      renderHybridCalendar();
    }
    openHybridSheet(date);
  }

  function openHybridSheet(date) {
    const day = hyDayMap().get(date);
    $("day-sheet-title").textContent = "Hybrid \u00b7 " + shortDate(date);
    const body = $("day-sheet-body");
    body.replaceChildren();
    const picks = day && Array.isArray(day.picks) ? day.picks : [];
    if (!picks.length) {
      const card = document.createElement("div");
      card.className = "day-model card";
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "No hybrid picks this day.";
      card.appendChild(p);
      body.appendChild(card);
    } else {
      picks.forEach((p) => {
        const card = document.createElement("div");
        card.className = "day-model card hy-pick";
        const h = document.createElement("h3");
        h.textContent = p.horse;
        card.appendChild(h);
        const race = [p.track, Number.isFinite(p.race_no) ? "R" + p.race_no : ""].filter(Boolean).join(" ");
        card.appendChild(sheetLine("Track / race", race || "\u2014"));
        const stage = p.price_stage && BP && BP.stageLabel ? BP.stageLabel(p.price_stage) : p.price_stage;
        const priceLine = sheetLine("Price", Number.isFinite(p.price) ? p.price.toFixed(2) : "\u2014");
        if (stage) {
          const note = document.createElement("span");
          note.className = "muted bp-stage";
          note.textContent = " " + stage;
          priceLine.appendChild(note);
        }
        card.appendChild(priceLine);
        const tone = p.result === "won" ? "pos" : p.result === "lost" ? "neg" : "";
        card.appendChild(sheetLine("Result", resultLabel(p.result), tone));
        card.appendChild(sheetLine("P/L", Number.isFinite(p.pl_units) ? fmtPl(p.pl_units) + "u" : "\u2014", plClass(p.pl_units)));
        body.appendChild(card);
      });
    }
    $("day-sheet").hidden = false;
    document.body.classList.add("sheet-open");
  }

  function bindHybridEvents() {
    if (!$("hybrid-section")) return;
    document.querySelectorAll("[data-page-tab]").forEach((btn) => {
      btn.addEventListener("click", () => setPageTab(btn.getAttribute("data-page-tab")));
    });
    $("hy-prev").addEventListener("click", () => {
      state.hy.month = CAL.ymAdd(state.hy.month || hybridPicksRange().to.slice(0, 7), -1);
      renderHybridCalendar();
    });
    $("hy-next").addEventListener("click", () => {
      state.hy.month = CAL.ymAdd(state.hy.month || hybridPicksRange().to.slice(0, 7), 1);
      renderHybridCalendar();
    });
  }

  function init() {
    $("ver").textContent = "v" + APP_VERSION;
    state.token = getToken();
    state.includeReconstructed = getIncludeReconstructed();
    const reconToggle = $("toggle-reconstructed");
    if (reconToggle) reconToggle.checked = state.includeReconstructed;
    syncReconToggle();
    if (isDemoMode() && !state.token) state.token = "demo-local"; // localhost ?demo=1 only; never stored
    bindEvents();
    if (BP) readLadderPrefs();
    bindBestPickEvents();
    bindHybridEvents();
    const H = window.NDModelsHandoff;
    const authError = H && H.getAuthError ? H.getAuthError() : "";
    if (authError) state.gateMessage = API.describeAuthError(authError);
    const code = H && H.takePendingCode ? H.takePendingCode() : "";
    if (code && !isDemoMode()) {
      state.token = "";
      state.signingIn = true;
      setView();
      API.exchangeAndStore(code, localStorage).then(
        (res) => finishSignIn(res && res.ok, res && res.status),
        () => finishSignIn(false, 0)
      );
      return;
    }
    startSignedIn();
  }

  /** After the one-time #code= exchange: 200 stores the token and loads; anything else shows the Discord button again. */
  function finishSignIn(ok, status) {
    state.signingIn = false;
    if (ok) {
      state.gateMessage = "";
      state.authHandled = false;
      state.forbidden = false;
      state.token = getToken();
    } else {
      // invalid_code (401) or anything else: drop this page's key and show the Discord button again.
      API.clearPrimaryToken(localStorage);
      state.token = "";
      state.gateMessage = API.describeAuthError(status === 429 ? "rate_limited" : "login_failed");
    }
    startSignedIn();
  }

  function startSignedIn() {
    setView();
    if (signedIn()) {
      const to = DATES.todayMelbourneIso();
      $("date-to").value = to;
      state.rangeTo = to;
      state.allTime = true;
      syncRangeInputs();
      loadBestPicks(); // own request; a model-stats failure never blanks it
      applyAllTime();
      if (state.pageTab === "hybrid") setPageTab("hybrid");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();