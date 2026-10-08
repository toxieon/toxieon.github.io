/* ts-time.js — Timesheet time helpers (0.2.1). Pure, no DOM; window.TsTime in
 * the app, CommonJS in tests (timesheet/ts-time.test.cjs).
 *
 *   parseTypedTime   typed clock times ("7:30", "730", "3:30 pm", "7a") -> "HH:MM"
 *   snapClock        rounding that respects the user's standard start/finish
 *   isEntryLocked    the one guard for entries that must never be edited
 *   timeline*        handle model for the History day timeline slider
 *   migrateStartFinish  one-time 7:30/3:30 start/finish migration (idempotent)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TsTime = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function toMin(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }
  function toHHMM(mins) { mins = ((Math.round(mins) % 1440) + 1440) % 1440; return pad2(Math.floor(mins / 60)) + ":" + pad2(mins % 60); }

  /* Accepts 7:30, 730, 0730, 7.30, 15:30, 1530, 3:30pm, 3:30 pm, 3pm, 7a, 7, 12am/12pm.
   * Returns "HH:MM" (24h, the value an <input type="time"> uses) or null. */
  function parseTypedTime(input) {
    var s = String(input == null ? "" : input).trim().toLowerCase().replace(/\s+/g, "").replace(/\.(?=m$)/, "").replace(/a\.m\.?$|am$|a$/, "a").replace(/p\.m\.?$|pm$|p$/, "p");
    var m = /^(\d{1,2})(?:[:.h](\d{2}))?([ap])?$/.exec(s) || /^(\d{1,2})(\d{2})([ap])?$/.exec(s);
    if (!m) return null;
    var h = +m[1], mi = m[2] == null ? 0 : +m[2], ap = m[3] || "";
    if (mi > 59) return null;
    if (ap) {
      if (h < 1 || h > 12) return null;
      if (ap === "a") h = h === 12 ? 0 : h; else h = h === 12 ? 12 : h + 12;
    } else if (h > 23) return null;
    return pad2(h) + ":" + pad2(mi);
  }

  /* Rounding to settings.roundingMin, using the user's standard times: a clock
   * time from the standard start (or finish) up to one rounding step after it
   * snaps back to that standard time instead of rounding up to the next step.
   * Everything else rounds to the nearest step, as before. No step = no change.
   * kind: "on" (uses standardClockOn) | "off" (uses standardClockOff). */
  function snapClock(hhmm, kind, settings) {
    settings = settings || {};
    var m = toMin(hhmm), step = Number(settings.roundingMin) || 0;
    if (m == null || step <= 0) return hhmm;
    var std = toMin(kind === "off" ? settings.standardClockOff : settings.standardClockOn);
    if (std != null && m >= std && m < std + step) return toHHMM(std);
    return toHHMM(Math.round(m / step) * step);
  }

  /* Timesheet has no lock/submit/export state yet; these are the flags any
   * future (or synced) lock would use. An open (still clocked-on) shift is
   * also never touched. Every edit path added in 0.2.1 checks this. */
  var LOCKED_STATUSES = ["locked", "submitted", "exported", "approved", "paid"];
  function isEntryLocked(s) {
    if (!s) return true;
    if (s._open || s.locked === true || s.submitted === true || s.exported === true || s.is_locked === true) return true;
    if (s.locked === "TRUE" || s.submitted === "TRUE" || s.exported === "TRUE") return true;
    return LOCKED_STATUSES.indexOf(String(s.status || "").toLowerCase()) !== -1;
  }

  /* ---- timeline ----
   * entries: [{ on, off (minutes), locked }] sorted by start, same day, off > on.
   * Adjacent entries whose times meet (A.off === B.on) share ONE handle that
   * moves both. Returns handles with their allowed [min, max]. */
  function timelineHandles(entries, opts) {
    var a0 = opts.axisStart, a1 = opts.axisEnd, md = opts.minDur || 1, out = [];
    entries.forEach(function (e, i) {
      var prev = entries[i - 1], next = entries[i + 1];
      if (prev && prev.off === e.on) {
        out.push({ key: "b" + i, minutes: e.on, targets: [{ i: i - 1, field: "off" }, { i: i, field: "on" }],
          min: prev.on + md, max: e.off - md, disabled: !!(prev.locked || e.locked) });
      } else {
        out.push({ key: "s" + i, minutes: e.on, targets: [{ i: i, field: "on" }],
          min: prev ? prev.off : a0, max: e.off - md, disabled: !!e.locked });
      }
      if (!(next && next.on === e.off)) {
        out.push({ key: "e" + i, minutes: e.off, targets: [{ i: i, field: "off" }],
          min: e.on + md, max: next ? next.on : a1, disabled: !!e.locked });
      }
    });
    out.forEach(function (h) { h.min = Math.max(h.min, a0); h.max = Math.min(h.max, a1); });
    return out;
  }
  /* Snap a dragged position to the rounding step and clamp it to the handle's range. */
  function timelineSnap(minutes, handle, step) {
    var v = step > 0 ? Math.round(minutes / step) * step : Math.round(minutes);
    if (v < handle.min) v = step > 0 ? Math.ceil(handle.min / step) * step : handle.min;
    if (v > handle.max) v = step > 0 ? Math.floor(handle.max / step) * step : handle.max;
    if (v < handle.min || v > handle.max) v = Math.min(Math.max(v, handle.min), handle.max);   // range narrower than a step
    return v;
  }
  /* Axis for a day: whole hours, an hour either side of the work (and the
   * standard day), never past 00:00 or 24:00. */
  function timelineAxis(entries, settings) {
    var lo = Infinity, hi = -Infinity;
    entries.forEach(function (e) { lo = Math.min(lo, e.on); hi = Math.max(hi, e.off); });
    var so = toMin(settings && settings.standardClockOn), sf = toMin(settings && settings.standardClockOff);
    if (so != null) lo = Math.min(lo, so); if (sf != null) hi = Math.max(hi, sf);
    return { axisStart: Math.max(0, Math.floor((lo - 60) / 60) * 60), axisEnd: Math.min(1440, Math.ceil((hi + 60) / 60) * 60) };
  }

  /* ---- one-time start/finish migration ----
   * Brandon's start/finish -> 7:30 AM / 3:30 PM, only when still on an old
   * default and never set by the user; then re-snap PENDING entries sitting
   * on 08:00. Pending = not locked (isEntryLocked) and in the current week
   * (Timesheet doesn't record exports; it exports weekly, so earlier weeks are
   * treated as exported). Locked/earlier entries are never modified.
   * Runs once per device (state.migrations[FLAG]); returns what it did. */
  var FLAG = "startFinish730_0_2_1";
  var NEW_START = "07:30", NEW_FINISH = "15:30";
  var OLD_START = ["07:00", "08:00"], OLD_FINISH = ["15:30"];
  function migrateStartFinish(state, opts) {
    opts = opts || {};
    state.migrations = state.migrations || {};
    if (state.migrations[FLAG]) return { ran: false, reason: "done", record: state.migrations[FLAG] };
    var s = state.settings || (state.settings = {});
    var email = String(s.googleEmail || s.currentUser || "").trim().toLowerCase();
    var primary = String(opts.primaryEmail || "").trim().toLowerCase();
    var at = opts.now || new Date().toISOString();
    if (!email) return { ran: false, reason: "identity-unknown" };            // retried after sign-in
    if (!primary || email !== primary) {
      state.migrations[FLAG] = { at: at, skipped: "not-primary-user", resnapped: 0 };
      return { ran: false, reason: "not-primary-user", record: state.migrations[FLAG] };
    }
    var userSet = !!s.startFinishSetByUser;
    var startFrom = s.standardClockOn || "", finishFrom = s.standardClockOff || "";
    var startChanged = !userSet && (startFrom === "" || OLD_START.indexOf(startFrom) !== -1) && startFrom !== NEW_START;
    var finishChanged = !userSet && (finishFrom === "" || OLD_FINISH.indexOf(finishFrom) !== -1) && finishFrom !== NEW_FINISH;
    if (startChanged) s.standardClockOn = NEW_START;
    if (finishChanged) s.standardClockOff = NEW_FINISH;
    var weekStart = opts.currentWeekStart || "";
    var ids = [], skippedLocked = 0;
    (state.sessions || []).forEach(function (e) {
      if (e.time_on_rounded !== "08:00") return;
      if (isEntryLocked(e)) { skippedLocked++; return; }
      if (!weekStart || !e.date || e.date < weekStart) return;          // not pending
      if (toMin(e.time_on) == null) return;
      var r = snapClock(e.time_on, "on", s);
      if (r === e.time_on_rounded) return;
      e.time_on_rounded = r;
      if (opts.recompute) opts.recompute(e);
      ids.push(e.session_id);
    });
    state.migrations[FLAG] = { at: at, startFrom: startFrom, finishFrom: finishFrom, startChanged: startChanged, finishChanged: finishChanged,
      start: s.standardClockOn, finish: s.standardClockOff, resnapped: ids.length, resnappedIds: ids, skippedLocked: skippedLocked, toastShown: false };
    return { ran: true, record: state.migrations[FLAG], ids: ids };
  }

  return { parseTypedTime: parseTypedTime, snapClock: snapClock, isEntryLocked: isEntryLocked, toMin: toMin, toHHMM: toHHMM,
    timelineHandles: timelineHandles, timelineSnap: timelineSnap, timelineAxis: timelineAxis,
    migrateStartFinish: migrateStartFinish, MIGRATION_FLAG: FLAG, NEW_START: NEW_START, NEW_FINISH: NEW_FINISH };
});
