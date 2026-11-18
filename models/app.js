/* TipBot model stats — owner-only comparison dashboard. */
(function () {
  "use strict";

  const APP_VERSION = "0.1.2";
  const CFG = window.ND_MODELS_CONFIG;
  const N = window.NDModelsNormalise;
  const DEMO = window.NDModelsDemo;
  const CAL = window.NDModelsCalendar;
  const DATES = window.NDModelsDates;

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
    rangeFrom: "",
    rangeTo: "",
    breakdownTab: "price_band",
    breakdownModel: "with_price",
    gateMessage: "",
    loadError: "",
    apiNotLive: false,
    calendarMonth: "",
    joinedByDate: null,
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

  async function fetchStats(from, to) {
    if (isDemoMode()) {
      const raw = DEMO.generateDemoStats(from, to);
      return { ok: true, data: N.normalizeStatsPayload(raw), demo: true };
    }
    const url = CFG.API_BASE.replace(/\/+$/, "") + "/api/owner/model-stats?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
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
    return { ok: true, data: N.normalizeStatsPayload(json) };
  }

  function validateRange(from, to) {
    if (!from || !to || from > to) return "Choose a valid date range.";
    const days = (new Date(to) - new Date(from)) / 86400000;
    if (days > 365) return "Maximum range is 365 days.";
    return "";
  }

  async function reload() {
    if (!signedIn()) return;
    const from = $("date-from").value || state.rangeFrom;
    const to = $("date-to").value || state.rangeTo;
    const err = validateRange(from, to);
    if (err) {
      state.loadError = err;
      renderStatus();
      return;
    }
    state.rangeFrom = from;
    state.rangeTo = to;
    state.loadError = "";
    state.apiNotLive = false;
    $("dashboard").hidden = true;
    $("load-state").hidden = false;
    $("load-state").textContent = "Loading stats…";
    const result = await fetchStats(from, to);
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
    $("dashboard").hidden = false;
    renderAll();
  }

  function signOutAndShowGate() {
    setToken("");
    state.token = "";
    state.data = null;
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
      text.textContent =
        "Not available: either the stats API isn't live yet, or this token isn't the owner's.";
      changeBtn.hidden = false;
    } else if (state.loadError) {
      wrap.hidden = false;
      text.textContent = state.loadError;
    }
  }

  function renderMeta() {
    $("generated-at").textContent = state.data ? "Generated " + melbourneTime(state.data.generated_at) + " (Melbourne)" : "";
    $("range-label").textContent = state.data ? state.data.range.from + " → " + state.data.range.to : "";
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
      const row = document.createElement("div");
      row.className = "stats-row";
      row.append(
        textStat("Strike", fmtPct(s.strike_pct)),
        textStat("ROI", fmtPct(s.roi_pct)),
        textStat("Bets", String(s.bets)),
        textStat("Staked", fmt(s.staked_units) + " u")
      );
      card.append(row);
      root.appendChild(card);
    }
  }

  function textStat(label, value) {
    const span = document.createElement("span");
    span.textContent = label + ": " + value;
    return span;
  }

  function renderBankrollChart() {
    const svg = $("bankroll-chart");
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const series = CFG.MODELS.map((id) => ({
      id,
      label: CFG.MODEL_LABELS[id],
      color: id === "with_price" ? "var(--m-with)" : id === "without_price" ? "var(--m-without)" : "var(--m-agree)",
      points: state.data.models[id].daily.filter((d) => d.date),
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
      path.setAttribute("stroke", s.color);
      path.setAttribute("stroke-width", "2");
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

  function renderBreakdown() {
    const model = state.breakdownModel;
    const tab = state.breakdownTab;
    const m = state.data.models[model];
    const key = tab === "price_band" ? "by_price_band" : tab === "track" ? "by_track" : "by_stake_bracket";
    const rows = m[key];
    const tbody = $("breakdown-body");
    tbody.replaceChildren();
    if (!rows.length) {
      $("breakdown-empty").hidden = false;
      return;
    }
    $("breakdown-empty").hidden = true;
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      ["label", "bets", "wins", "strike_pct", "pl_units", "roi_pct"].forEach((col, i) => {
        const td = document.createElement("td");
        if (col === "strike_pct" || col === "roi_pct") td.textContent = fmtPct(r[col]);
        else if (col === "pl_units") {
          td.textContent = fmtPl(r[col]);
          td.className = plClass(r[col]);
        } else td.textContent = String(r[col]);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    document.querySelectorAll("[data-break-tab]").forEach((btn) => {
      btn.classList.toggle("on", btn.getAttribute("data-break-tab") === tab);
    });
    document.querySelectorAll("[data-break-model]").forEach((btn) => {
      btn.classList.toggle("on", btn.getAttribute("data-break-model") === model);
    });
  }

  function renderRecent() {
    const model = $("recent-model").value;
    const recent = state.data.models[model].recent;
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
      const tr = document.createElement("tr");
      const cols = [
        r.date,
        r.track,
        String(r.race_no),
        r.horse,
        fmt(r.price, 2),
        fmt(r.stake_units, 1),
      ];
      cols.forEach((c) => {
        const td = document.createElement("td");
        td.textContent = c;
        tr.appendChild(td);
      });
      const resTd = document.createElement("td");
      resTd.textContent = r.result;
      resTd.className = "result-" + r.result;
      tr.appendChild(resTd);
      const plTd = document.createElement("td");
      plTd.textContent = fmtPl(r.pl_units);
      plTd.className = plClass(r.pl_units);
      tr.appendChild(plTd);
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
      if (day && inRange) {
        const hasAny = CFG.MODELS.some((id) => day[id] && day[id].bets);
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
    CFG.MODELS.forEach((id) => {
      const slice = day[id];
      const card = document.createElement("div");
      card.className = "day-model card";
      const h = document.createElement("h3");
      h.textContent = CFG.MODEL_LABELS[id];
      card.appendChild(h);
      if (!slice || !slice.bets) {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = "No bets this day.";
        card.appendChild(p);
      } else {
        const strike = CAL.dailyStrikePct(slice.bets, slice.wins);
        const stats = document.createElement("p");
        stats.className = "stats-row";
        stats.append("P&L ");
        const strong = document.createElement("strong");
        strong.className = plClass(slice.pl_units);
        strong.textContent = fmtPl(slice.pl_units) + "u";
        stats.append(strong, " · Bets " + slice.bets + " · Wins " + slice.wins + " · Strike " + fmtPct(strike));
        card.appendChild(stats);
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
            "u";
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
      [d.date, fmtPl(d.with_price), fmtPl(d.without_price), fmtPl(d.agree)].forEach((c, i) => {
        const td = document.createElement("td");
        td.textContent = c;
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
    renderRecent();
    renderHeadToHead();
  }

  function applyPreset(days) {
    const to = DATES.todayMelbourneIso();
    const from = DATES.addCalendarDays(to, -(days - 1));
    $("date-from").value = from;
    $("date-to").value = to;
    document.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.classList.toggle("on", Number(btn.getAttribute("data-preset")) === days);
    });
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
    applyPreset(30);
  }

  function bindEvents() {
    $("auth-form").addEventListener("submit", (e) => {
      e.preventDefault();
      saveTokenFromGate();
    });
    $("btn-signout").addEventListener("click", signOutAndShowGate);
    $("btn-banner-change-token").addEventListener("click", signOutAndShowGate);
    $("btn-apply-range").addEventListener("click", () => reload());
    document.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => applyPreset(Number(btn.getAttribute("data-preset"))));
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
    if (isDemoMode() && !state.token) {
      state.token = "demo-local";
      setToken("demo-local");
    }
    bindEvents();
    setView();
    if (signedIn()) {
      const to = DATES.todayMelbourneIso();
      $("date-to").value = to;
      $("date-from").value = DATES.addCalendarDays(to, -29);
      applyPreset(30);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();