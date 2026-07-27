/* =========================================================================
 *  countdown-confirm.js — auto-confirming prompt with a depleting bar
 *
 *  Origin: extracted from Timesheet's "near" clock-on prompt.
 *  Purpose: "assume yes, but give a moment to change your mind." Shows a
 *  bottom sheet with a bar that drains over N seconds and then fires
 *  onConfirm automatically — unless the user taps a button first.
 *
 *  Self-contained: injects its own styles + DOM. No dependencies. Picks up
 *  nd-core.css variables (--nd-surface, --nd-border, --nd-text) when present,
 *  otherwise falls back to a dark theme so it works dropped into any page.
 *
 *  Global `NDCountdownConfirm`:
 *
 *    NDCountdownConfirm.open({
 *      title,                 heading text
 *      message,               body text (HTML allowed)
 *      seconds = 4,           countdown length before auto-confirm
 *      confirmLabel = "Confirm",
 *      secondaryLabel,        optional middle button (e.g. "Change")
 *      accent = "#3ab87a",    bar + primary button colour
 *      onConfirm, onSecondary, onCancel   callbacks
 *    }) -> { close(fireCancel) }
 *
 *  Confirm (button or auto) → onConfirm. Secondary → onSecondary.
 *  Backdrop tap or Esc → onCancel. All stop the countdown.
 * ========================================================================= */
(function (root) {
  "use strict";
  if (typeof document === "undefined") { root.NDCountdownConfirm = { open: function () {} }; return; }

  function injectStyles() {
    if (document.getElementById("ndcc-styles")) return;
    var css =
      ".ndcc-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity 180ms}" +
      ".ndcc-backdrop.ndcc-in{opacity:1}" +
      ".ndcc-sheet{background:var(--nd-surface,#1a1a1a);border:1px solid var(--nd-border,#2a2a2a);border-bottom:0;border-radius:18px 18px 0 0;width:100%;max-width:480px;padding:20px;color:var(--nd-text,#f0f0f0);font-family:var(--nd-sans,system-ui,-apple-system,'Segoe UI',sans-serif);transform:translateY(12px);transition:transform 200ms}" +
      ".ndcc-backdrop.ndcc-in .ndcc-sheet{transform:translateY(0)}" +
      ".ndcc-sheet h3{margin:0 0 10px;font-size:17px;font-weight:500}" +
      ".ndcc-msg{color:var(--nd-muted,#9aa0a8);font-size:13px;margin:0 0 4px}" +
      ".ndcc-wrap{height:6px;border-radius:999px;background:rgba(255,255,255,0.12);overflow:hidden;margin:14px 0 8px}" +
      ".ndcc-bar{height:100%;width:100%;border-radius:999px;background:var(--ndcc-accent,#3ab87a)}" +
      ".ndcc-hint{color:var(--nd-muted,#9aa0a8);font-size:12px;margin:0}" +
      ".ndcc-acts{display:flex;gap:10px;margin-top:14px}" +
      ".ndcc-b{flex:1;min-height:44px;padding:11px 16px;border-radius:999px;font-size:13px;font-weight:500;text-transform:uppercase;letter-spacing:0.04em;cursor:pointer;border:1px solid var(--nd-border,#2a2a2a);font-family:inherit}" +
      ".ndcc-b.ghost{background:rgba(255,255,255,0.06);color:var(--nd-text,#f0f0f0)}" +
      ".ndcc-b.primary{color:#022014;border:0}";
    var s = document.createElement("style");
    s.id = "ndcc-styles"; s.textContent = css;
    document.head.appendChild(s);
  }

  function open(opts) {
    opts = opts || {};
    injectStyles();
    var seconds = opts.seconds || 4;
    var accent = opts.accent || "#3ab87a";

    var backdrop = document.createElement("div");
    backdrop.className = "ndcc-backdrop";
    backdrop.style.setProperty("--ndcc-accent", accent);
    backdrop.innerHTML =
      '<div class="ndcc-sheet" role="alertdialog" aria-modal="true">' +
        "<h3></h3>" +
        '<div class="ndcc-msg"></div>' +
        '<div class="ndcc-wrap"><div class="ndcc-bar"></div></div>' +
        '<p class="ndcc-hint"></p>' +
        '<div class="ndcc-acts"></div>' +
      "</div>";
    backdrop.querySelector("h3").textContent = opts.title || "Confirm?";
    backdrop.querySelector(".ndcc-msg").innerHTML = opts.message || "";
    backdrop.querySelector(".ndcc-hint").textContent =
      opts.hint || ("Continuing automatically in " + seconds + "s" + (opts.secondaryLabel ? " — or choose an option." : "."));

    var acts = backdrop.querySelector(".ndcc-acts");
    var secBtn = null;
    if (opts.secondaryLabel) {
      secBtn = document.createElement("button");
      secBtn.className = "ndcc-b ghost"; secBtn.type = "button"; secBtn.textContent = opts.secondaryLabel;
      acts.appendChild(secBtn);
    }
    var okBtn = document.createElement("button");
    okBtn.className = "ndcc-b primary"; okBtn.type = "button";
    okBtn.style.background = accent;
    okBtn.textContent = opts.confirmLabel || "Confirm";
    acts.appendChild(okBtn);

    document.body.appendChild(backdrop);
    var bar = backdrop.querySelector(".ndcc-bar");
    requestAnimationFrame(function () {
      backdrop.classList.add("ndcc-in");
      bar.style.transition = "width " + seconds + "s linear";
      bar.style.width = "0%";
    });

    var settled = false, timer = null;
    function teardown() {
      backdrop.classList.remove("ndcc-in");
      setTimeout(function () { backdrop.remove(); }, 200);
      document.removeEventListener("keydown", onKey);
    }
    function finish(which) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      teardown();
      var cb = which === "confirm" ? opts.onConfirm : which === "secondary" ? opts.onSecondary : opts.onCancel;
      if (typeof cb === "function") { try { cb(); } catch (e) {} }
    }
    function onKey(e) { if (e.key === "Escape") finish("cancel"); }

    timer = setTimeout(function () { finish("confirm"); }, seconds * 1000);
    okBtn.addEventListener("click", function () { finish("confirm"); });
    if (secBtn) secBtn.addEventListener("click", function () { finish("secondary"); });
    backdrop.addEventListener("click", function (e) { if (e.target === backdrop) finish("cancel"); });
    document.addEventListener("keydown", onKey);

    return { close: function (fireCancel) { finish(fireCancel ? "cancel" : "confirm"); } };
  }

  var API = { open: open };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDCountdownConfirm = API;
})(typeof window !== "undefined" ? window : globalThis);
