/* =========================================================================
 *  nd-ui.js — Neill Data Suite shared UI kit (§1.5 + §1.6)
 *
 *  Requires nd-core.css. Components:
 *    NDUI.skeleton(container, {rows, variant})    variants: list-row | card |
 *                                                 grid-tile | table-row
 *    NDUI.skeletonOverlay(on)                     Quote's whole-app shimmer
 *                                                 (body class, pixel-identical)
 *    NDUI.toast(message, {action, onAction, duration})
 *                                                 action toasts power §2.4 undo
 *    NDUI.confirm({title, message, confirmLabel, cancelLabel, danger,
 *                  typeToConfirm})                -> Promise<boolean>
 *                                                 native confirm() is BANNED
 *                                                 in new code (§1.5)
 *    NDUI.lightbox({src, thumb, title})           shared photo viewer with the
 *                                                 v1.0 §1.2 regex fix baked in
 *    NDUI.highResUrl(url)                         /=s\d+$/ -> =s1600 (the fix)
 *    NDUI.syncChip(mountEl, queue)                §1.6 suite-wide status chip
 *
 *  Pure string/URL helpers are Node-testable: node shared/nd-ui.test.js
 * ========================================================================= */
(function (root) {
  "use strict";

  const SKELETON_VARIANTS = ["list-row", "card", "grid-tile", "table-row"];

  /* ── pure helpers ──────────────────────────────────────────────────── */
  function escapeHtml(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* v1.0 §1.2: the old source had /=s\\d+$/ (double backslash) which
   * matched a literal backslash and never fired — lightboxes showed the
   * low-res thumb forever. THE fix: single backslash, replace size token. */
  function highResUrl(url, size) {
    if (!url) return url;
    return url.replace(/=s\d+(-c)?$/, "=s" + (size || 1600));
  }

  function skeletonMarkup(opts) {
    opts = opts || {};
    const variant = SKELETON_VARIANTS.indexOf(opts.variant) !== -1 ? opts.variant : "list-row";
    const rows = Math.max(1, opts.rows || 3);
    let items = "";
    for (let i = 0; i < rows; i++) items += '<div class="nd-skel-item"></div>';
    return '<div class="nd-skel nd-skel--' + variant + '" aria-hidden="true" role="presentation">' + items + "</div>";
  }

  /* ── DOM components (browser only) ─────────────────────────────────── */
  function skeleton(container, opts) {
    container.innerHTML = skeletonMarkup(opts);
    return function clear() {
      const el = container.querySelector(".nd-skel");
      if (el) el.remove();
    };
  }

  function skeletonOverlay(on) {
    document.body.classList.toggle("loading-skeleton", !!on);
  }

  let toastWrap = null;
  function ensureToastWrap() {
    if (!toastWrap || !document.body.contains(toastWrap)) {
      toastWrap = document.createElement("div");
      toastWrap.className = "nd-toast-wrap";
      document.body.appendChild(toastWrap);
    }
    return toastWrap;
  }

  function toast(message, opts) {
    opts = opts || {};
    const hasAction = !!(opts.action && opts.onAction);
    const duration = opts.duration || (hasAction ? 6000 : 2800);
    const el = document.createElement("div");
    el.className = "nd-toast";
    el.setAttribute("role", "status");
    el.innerHTML = "<span>" + escapeHtml(message) + "</span>" +
      (hasAction ? '<button type="button" class="nd-toast-action">' + escapeHtml(opts.action) + "</button>" : "");
    ensureToastWrap().appendChild(el);

    let done = false;
    let timer = null;
    function dismiss(actioned) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.classList.remove("nd-in");
      setTimeout(function () { el.remove(); }, 260);
      if (!actioned && opts.onExpire) { try { opts.onExpire(); } catch (e) {} }
    }
    if (hasAction) {
      el.querySelector(".nd-toast-action").addEventListener("click", function () {
        dismiss(true);
        try { opts.onAction(); } catch (e) {}
      });
    }
    requestAnimationFrame(function () { el.classList.add("nd-in"); });
    timer = setTimeout(function () { dismiss(false); }, duration);
    return { dismiss: function () { dismiss(false); }, el: el };
  }

  function confirmDialog(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      const needsTyping = !!opts.typeToConfirm;
      const backdrop = document.createElement("div");
      backdrop.className = "nd-dialog-backdrop";
      backdrop.innerHTML =
        '<div class="nd-dialog" role="alertdialog" aria-modal="true">' +
          "<h3>" + escapeHtml(opts.title || "Are you sure?") + "</h3>" +
          (opts.message ? "<p>" + escapeHtml(opts.message) + "</p>" : "") +
          (needsTyping
            ? '<p>Type <strong style="color:var(--nd-text);font-family:var(--nd-mono)">' + escapeHtml(opts.typeToConfirm) +
              "</strong> to confirm.</p>" +
              '<input class="nd-dialog-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" />'
            : "") +
          '<div class="nd-dialog-actions">' +
            '<button type="button" class="nd-dialog-cancel">' + escapeHtml(opts.cancelLabel || "Cancel") + "</button>" +
            '<button type="button" class="nd-dialog-confirm' + (opts.danger ? " nd-danger" : "") + '"' + (needsTyping ? " disabled" : "") + ">" +
              escapeHtml(opts.confirmLabel || "OK") + "</button>" +
          "</div>" +
        "</div>";
      document.body.appendChild(backdrop);

      const confirmBtn = backdrop.querySelector(".nd-dialog-confirm");
      const input = backdrop.querySelector(".nd-dialog-input");

      function close(result) {
        backdrop.classList.remove("nd-in");
        setTimeout(function () { backdrop.remove(); }, 220);
        document.removeEventListener("keydown", onKey);
        resolve(result);
      }
      function onKey(e) {
        if (e.key === "Escape") close(false);
        if (e.key === "Enter" && !confirmBtn.disabled && document.activeElement !== backdrop.querySelector(".nd-dialog-cancel")) close(true);
      }
      backdrop.querySelector(".nd-dialog-cancel").addEventListener("click", function () { close(false); });
      confirmBtn.addEventListener("click", function () { if (!confirmBtn.disabled) close(true); });
      backdrop.addEventListener("click", function (e) { if (e.target === backdrop) close(false); });
      document.addEventListener("keydown", onKey);
      if (input) {
        input.addEventListener("input", function () {
          confirmBtn.disabled = input.value.trim() !== opts.typeToConfirm;
        });
        setTimeout(function () { input.focus(); }, 250);
      }
      requestAnimationFrame(function () { backdrop.classList.add("nd-in"); });
    });
  }

  function lightbox(opts) {
    opts = opts || {};
    const thumb = opts.thumb || opts.src;
    const full = opts.src ? highResUrl(opts.src) : highResUrl(thumb);
    const backdrop = document.createElement("div");
    backdrop.className = "nd-lightbox-backdrop";
    backdrop.innerHTML =
      '<div class="nd-lightbox-bar">' +
        "<span>" + escapeHtml(opts.title || "") + "</span>" +
        '<button type="button" class="nd-lightbox-close" aria-label="Close">✕</button>' +
      "</div>" +
      '<div class="nd-lightbox-img"><img src="' + escapeHtml(thumb) + '" alt="' + escapeHtml(opts.title || "") + '" /></div>';
    document.body.appendChild(backdrop);

    const img = backdrop.querySelector("img");
    if (full && full !== thumb) {
      const hi = new Image();
      hi.onload = function () { img.src = full; };   // swap only when ready — no flash
      hi.src = full;
    }
    function close() {
      backdrop.classList.remove("nd-in");
      setTimeout(function () { backdrop.remove(); }, 220);
      document.removeEventListener("keydown", onKey);
      if (opts.onClose) { try { opts.onClose(); } catch (e) {} }
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    backdrop.querySelector(".nd-lightbox-close").addEventListener("click", close);
    backdrop.addEventListener("click", function (e) { if (e.target === backdrop || e.target.classList.contains("nd-lightbox-img")) close(); });
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(function () { backdrop.classList.add("nd-in"); });
    return { close: close };
  }

  /* ── §1.6 sync status chip ─────────────────────────────────────────── */
  function syncChipLabel(status, count) {
    if (status === "failed") return count ? count + " failed" : "sync failed";
    if (status === "pending" || status === "flushing") return count ? count + " queued" : "syncing";
    return "synced";
  }

  function syncChip(mountEl, queue) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "nd-sync-chip";
    chip.setAttribute("aria-label", "Sync status");
    let panel = null;

    function refresh(status) {
      status = status || queue.status();
      const count = queue.size();
      chip.dataset.sync = status;
      chip.textContent = syncChipLabel(status, count);
    }

    function closePanel() {
      if (panel) { panel.remove(); panel = null; }
      document.removeEventListener("click", onDocClick, true);
    }
    function onDocClick(e) {
      if (panel && !panel.contains(e.target) && e.target !== chip) closePanel();
    }
    function openPanel() {
      closePanel();
      panel = document.createElement("div");
      panel.className = "nd-sync-panel";
      const items = queue.pending();
      let rows = "";
      items.slice(0, 8).forEach(function (it) {
        rows += '<div class="nd-sync-row"><span>' + escapeHtml(it.kind + (it.key ? " · " + it.key : "")) + "</span>" +
          (it.lastError ? '<span class="nd-err">' + escapeHtml(it.lastError) + "</span>" : "<span>queued</span>") + "</div>";
      });
      if (items.length > 8) rows += '<div class="nd-sync-row"><span>… +' + (items.length - 8) + " more</span></div>";
      panel.innerHTML = "<h4>Sync queue</h4>" +
        (items.length ? rows : '<div class="nd-sync-panel-empty">All changes synced.</div>') +
        (items.length ? '<button type="button" class="nd-sync-retry">Retry now</button>' : "");
      const retry = panel.querySelector(".nd-sync-retry");
      if (retry) retry.addEventListener("click", function () { queue.flush(); closePanel(); });
      document.body.appendChild(panel);
      document.addEventListener("click", onDocClick, true);
    }

    chip.addEventListener("click", function () { panel ? closePanel() : openPanel(); });
    queue.onStatus(function (s) { refresh(s); });
    refresh();
    mountEl.appendChild(chip);
    return { refresh: refresh, el: chip };
  }

  /* §3.6 — the shared mobile settings pattern: turns flat section blocks
   * into collapsible accordions. All collapsed by default, open state
   * remembered per storageKey. Sections named in opts.danger get
   * red danger styling. Built for Timesheet, reused by Quote (§4). */
  function accordion(rootEl, opts) {
    opts = opts || {};
    const sectionSel = opts.sectionSelector || ".settings-section";
    const titleSel = opts.titleSelector || "h3";
    const storageKey = opts.storageKey || "nd-accordion";
    const dangerTitles = (opts.danger || []).map(function (s) { return s.toLowerCase(); });
    let openSet;
    try { openSet = new Set(JSON.parse(localStorage.getItem(storageKey)) || []); } catch (e) { openSet = new Set(); }
    function saveOpen() {
      try { localStorage.setItem(storageKey, JSON.stringify(Array.from(openSet))); } catch (e) {}
    }
    Array.prototype.forEach.call(rootEl.querySelectorAll(sectionSel), function (section) {
      if (section.dataset.ndAcc) return;
      section.dataset.ndAcc = "1";
      const title = section.querySelector(titleSel);
      if (!title) return;
      const name = title.textContent.trim();
      const isDanger = dangerTitles.indexOf(name.toLowerCase()) !== -1;
      const details = document.createElement("details");
      details.className = "nd-acc" + (isDanger ? " nd-acc-danger" : "");
      if (openSet.has(name)) details.open = true;
      const summary = document.createElement("summary");
      summary.className = "nd-acc-summary";
      summary.textContent = name;
      details.appendChild(summary);
      const body = document.createElement("div");
      body.className = "nd-acc-body";
      const kids = Array.prototype.slice.call(section.children).filter(function (el) { return el !== title; });
      kids.forEach(function (el) { body.appendChild(el); });
      details.appendChild(body);
      title.remove();
      section.appendChild(details);
      details.addEventListener("toggle", function () {
        if (details.open) openSet.add(name); else openSet.delete(name);
        saveOpen();
      });
    });
  }

  /* §5.1 — continue-where-you-left-off. Apps record meaningful navigation;
   * Hub renders the most recent few as one-tap deep links. Stored in
   * nd-cache when available (spec) with a localStorage mirror so apps that
   * don't load nd-cache still participate. */
  /* §5.3 — batch-fill: Upload's copy-to-all / first-to-all pattern as a
   * generic helper. Copies `fields` from source onto every target (or a
   * full deep list copy when fields is omitted and source is an array). */
  function batchFill(source, targets, fields) {
    if (Array.isArray(source) && targets === undefined) {
      return source.map(function (row) { return JSON.parse(JSON.stringify(row)); });   // deep list copy
    }
    (targets || []).forEach(function (t) {
      (fields || Object.keys(source)).forEach(function (f) {
        if (source[f] !== undefined) t[f] = source[f];
      });
    });
    return targets;
  }

  const RECENT_KEY = "nd:recent:v1";
  const RECENT_MAX = 12;

  function readRecentLocal() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; }
  }

  function recordVisit(app, context, label, url) {
    const entry = { app: app, context: context || "", label: label || app, url: url || "", ts: Date.now() };
    let list = readRecentLocal().filter(function (e) { return !(e.app === entry.app && e.context === entry.context); });
    list.unshift(entry);
    list = list.slice(0, RECENT_MAX);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) {}
    if (root.NDCache) { try { root.NDCache.put(RECENT_KEY, list); } catch (e) {} }
    return entry;
  }

  function recentVisits(limit) {
    const local = readRecentLocal();
    const finish = function (cacheList) {
      const merged = {};
      (cacheList || []).concat(local).forEach(function (e) {
        const k = e.app + "|" + e.context;
        if (!merged[k] || merged[k].ts < e.ts) merged[k] = e;
      });
      return Object.values(merged).sort(function (a, b) { return b.ts - a.ts; }).slice(0, limit || 5);
    };
    if (root.NDCache) {
      return root.NDCache.get(RECENT_KEY).then(finish).catch(function () { return finish([]); });
    }
    return Promise.resolve(finish([]));
  }

  const API = {
    SKELETON_VARIANTS,
    escapeHtml, highResUrl, skeletonMarkup, syncChipLabel,
    skeleton, skeletonOverlay, toast, confirm: confirmDialog, lightbox, syncChip, accordion, recordVisit, recentVisits, batchFill
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
  } else {
    root.ND = root.ND || {};
    root.ND.ui = API;
    root.NDUI = API;
  }
})(typeof window !== "undefined" ? window : globalThis);
