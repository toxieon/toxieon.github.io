/* TipBot model stats — owner-only comparison dashboard. */
(function () {
  "use strict";

  const APP_VERSION = "0.1.4";
  const CFG = window.ND_MODELS_CONFIG;
  const N = window.NDModelsNormalise;
  const DEMO = window.NDModelsDemo;
  const CAL = window.NDModelsCalendar;
  const DATES = window.NDModelsDates;
  const API = window.NDModelsApi;
  const FMT = window.NDModelsFormat;

  const UNAVAILABLE_MSG =
    "Not available: either the stats API isn't live yet, or this token isn't the owner's.";
  const STAKED_SEG = { without_price: "Without", with_price: "With", agree: "Agree" };
  const RECON_KEY = "nd_models_include_reconstructed";

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

  function getToken() {
    try {
      return localStorage.getItem(CFG.TOKEN_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setToken(t) {
    try {
      if (t) localStorage.setItem(CFG.TOKEN_KEY, t);
      else localStorage.removeItem(CFG.TOKEN_KEY);
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
    const authed = signedIn();
    $("auth-gate").hidden = authed;
    $("app-main").hidden = !authed;
    $("btn-signout").hidden = !authed;
    $("demo-badge").hidden = !isDemoMode() || !authed;
    if (!authed) {
      $("gate-message").textContent = state.gateMessage || "";
    }
  }

  async function fetchModelStats(from, to, options) {
    const opts = options && typeof options === "object" ? options : {};
    if (isDemoMode()) {
      const raw = opts.stakedOnly
        ? DEMO.generateStakedDemoStats(to)
        : DEMO.generateDemoStats(from, to, { includeReconstructed: state.includeReconstructed });
      const data = N.normalizeStatsPayload(raw);
      return {
        ok: true,
        data: opts.stakedOnly ? data : N.filterReconstructed(data, state.includeReconstructed),
        demo: true,
      };
    }
    const url = API.buildModelStatsUrl(CFG.API_BASE, from, to, {
      stakedOnly: !!opts.stakedOnly,
      includeReconstructed: !opts.stakedOnly && state.includeReconstructed,
    });
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + state.token },
      credentials: "omit",
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      setToken("");
      state.token = "";
      state.gateMessage = "Session expired or invalid token. Paste your owner token again.";
      setView();
      return { ok: false, auth: true };
    }
    if (res.status === 404) {
      return { ok: false, notLive: true };
    }
    if (!res.ok) {
      return { ok: false, error: "Request failed (" + res.status + ")." };
    }
    const json = await res.json();
    const data = N.normalizeStatsPayload(json);
    return {
      ok: true,
      data: opts.stakedOnly ? data : N.filterReconstructed(data, state.includeReconstructed),
    };
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

  async function reload() {
    if (!signedIn()) return;
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
    $("dashboard").hidden = true;
    $("load-state").hidden = false;
    $("load-state").textContent = "Loading stats…";
    loadStakedOnly();
    const result = await fetchModelStats(from, to, {});
    $("load-state").hidden = true;
    if (result.auth) return;
    if (result.notLive) {
      state.apiNotLive = true;
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
    state.joinedByDate = new Map(CAL.joinDailyByDate(state.data.models).map((d) => [d.date, d]));
    state.calendarMonth = state.rangeTo.slice(0, 7);
    if (state.data.range && state.data.range.from) {
      state.allTime = state.data.range.from === "all";
      state.rangeFrom = state.data.range.from;
    }
    $("dashboard").hidden = false;
    renderAll();
  }

  function signOutAndShowGate() {
    setToken("");
    state.token = "";
    state.data = null;
    state.stakedData = null;
    state.stakedNotLive = false;
    state.stakedError = "";
    state.gateMessage = "";
    state.apiNotLive = false;
    state.loadError = "";
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
    } else if (state.loadError) {
      wrap.hidden = false;
      text.textContent = state.loadError;
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
    const fromLbl = state.data.range.from === "all" ? "All time" : state.data.range.from;
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
      const mmeta = state.data.models[id].meta;
      const metaLine = formatMetaBlock(mmeta);
      if (metaLine) {
        const cm = document.createElement("p");
        cm.className = "card-meta";
        cm.textContent = metaLine;
        card.append(cm);
      }
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
    const series = CFG.MODELS.map((id) => ({
      id,
      color: modelStrokeColor(id),
      points: (modelsRoot[id].daily || [])
        .filter((d) => d.date)
        .map((d) => ({
          date: d.date,
          cum_units: Number.isFinite(d[valueField]) ? d[valueField] : 0,
        })),
    }));
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
      path.setAttribute("stroke-width", isPrimary ? "2.5" : "1.2");
      path.setAttribute("opacity", faintOthers && primary && !isPrimary ? "0.35" : "1");
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
    renderCumUnitsChart($("bankroll-chart"), state.data.models, {
      valueField: flat ? "hyp_cum_units" : "cum_units",
    });
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
    if (result.notLive) {
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
      errText.textContent = UNAVAILABLE_MSG;
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
      empty.hidden = false;
      chart.hidden = true;
      chart.replaceChildren();
      return;
    }
    empty.hidden = true;
    chart.hidden = false;
    renderCumUnitsChart(chart, state.stakedData.models, { primary: model, faintOthers: true });
  }

  function renderBreakdown() {
    const model = state.breakdownModel;
    const tab = state.breakdownTab;
    const m = state.data.models[model];
    const key = tab === "price_band" ? "by_price_band" : tab === "track" ? "by_track" : "by_stake_bracket";
    const rows = m[key];
    const tbody = $("breakdown-body");
    const head = $("breakdown-head");
    const showHyp = breakdownRowsHaveHyp(rows);
    head.replaceChildren();
    const headTr = document.createElement("tr");
    ["Label", "Bets", "Wins", "Strike %", "P&L u", "ROI %"].forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      headTr.append(th);
    });
    if (showHyp) {
      ["Flat P&L", "Flat ROI %"].forEach((h) => {
        const th = document.createElement("th");
        th.textContent = h;
        headTr.append(th);
      });
    }
    head.append(headTr);
    tbody.replaceChildren();
    if (!rows.length) {
      $("breakdown-empty").hidden = false;
      return;
    }
    $("breakdown-empty").hidden = true;
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      ["label", "bets", "wins", "strike_pct", "pl_units", "roi_pct"].forEach((col) => {
        const td = document.createElement("td");
        if (col === "strike_pct") td.textContent = FMT.formatPctWithN(r[col], r.bets);
        else if (col === "roi_pct") td.textContent = FMT.formatPctWithN(r[col], r.bets, { signed: true });
        else if (col === "pl_units") {
          td.textContent = fmtPl(r[col]);
          td.className = plClass(r[col]);
        } else td.textContent = String(r[col]);
        tr.appendChild(td);
      });
      if (showHyp) {
        const hp = r.hyp || {};
        const tdPl = document.createElement("td");
        tdPl.textContent = fmtPl(hp.pl_units);
        tdPl.className = plClass(hp.pl_units);
        tr.append(tdPl);
        const tdRoi = document.createElement("td");
        tdRoi.textContent = FMT.formatPctWithN(hp.roi_pct, FMT.hypSampleN(hp, r.bets), { signed: true });
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
            val.textContent = miniCellText(slice);
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
        if (slice.hyp_pl_units || slice.bets) {
          plLine.append(" · Flat 1u ");
          const hyp = document.createElement("strong");
          hyp.className = plClass(slice.hyp_pl_units);
          hyp.textContent = fmtPl(slice.hyp_pl_units) + "u";
          plLine.append(hyp);
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

  function saveTokenFromGate() {
    const t = ($("token-input").value || "").trim();
    if (!t) {
      state.gateMessage = "Enter your owner token.";
      $("gate-message").textContent = state.gateMessage;
      return;
    }
    state.token = t;
    setToken(t);
    state.gateMessage = "";
    $("token-input").value = "";
    setView();
    applyAllTime();
  }

  function bindEvents() {
    $("auth-form").addEventListener("submit", (e) => {
      e.preventDefault();
      saveTokenFromGate();
    });
    $("btn-signout").addEventListener("click", signOutAndShowGate);
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

  function init() {
    $("ver").textContent = "v" + APP_VERSION;
    state.token = getToken();
    state.includeReconstructed = getIncludeReconstructed();
    const reconToggle = $("toggle-reconstructed");
    if (reconToggle) reconToggle.checked = state.includeReconstructed;
    if (isDemoMode() && !state.token) {
      state.token = "demo-local";
      setToken("demo-local");
    }
    bindEvents();
    setView();
    if (signedIn()) {
      const to = DATES.todayMelbourneIso();
      $("date-to").value = to;
      state.rangeTo = to;
      state.allTime = true;
      syncRangeInputs();
      applyAllTime();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();