/* =========================================================================
 *  nd-queue.js — Neill Data Suite offline write queue (§1.3)
 *
 *  Ported from Timesheet's proven queue (flushQueue, 30s retry loop,
 *  'online' listener, debounced 1s flush — timesheet/index.html ~520-545),
 *  generalised:
 *    - Payload shape is generic: {kind, payload}. Consumers register an
 *      async handler per kind:  q.handler("sheetWrite", async p => {...})
 *    - Per-app namespace (queues share same-origin localStorage, so each
 *      app creates its own:  createQueue({name:"planner"}))
 *    - `supersede` keeps Timesheet's delete-drops-pending-writes trick:
 *      enqueue(kind, payload, {key, supersede:true}) removes queued items
 *      with the same key first (a queued append can't resurrect a row
 *      being deleted).
 *    - Inspectable for the sync chip (§1.6): q.pending() returns item
 *      copies incl. attempts + lastError; q.onStatus(cb) pushes
 *      'synced' | 'pending' | 'flushing' | 'failed'.
 *
 *  Retry semantics preserved from Timesheet: every failure keeps the item,
 *  the 30s loop retries forever, 'online' triggers an immediate flush.
 *  Status is 'failed' (red chip) once a flush pass leaves items behind
 *  while online; it self-heals to 'synced' when a later pass drains.
 *
 *  Consumers (per handoff): Upload (photos in signal black spots), Planner
 *  (delta writes), Quote (behind the scenes), Timesheet (re-pointed).
 *
 *  Node-testable via injected deps.  Run:  node shared/nd-queue.test.js
 * ========================================================================= */
(function (root) {
  "use strict";

  const DEBOUNCE_MS = 1000;
  const RETRY_MS    = 30000;

  let _uidCounter = 0;
  function defaultUid() {
    _uidCounter++;
    return "q" + Date.now().toString(36) + "-" + _uidCounter.toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function createQueue(opts) {
    opts = opts || {};
    if (!opts.name) throw new Error("nd-queue: createQueue({name}) is required (per-app namespace)");
    const deps = opts.deps || {};
    const storage    = deps.storage    || defaultStorage();
    const now        = deps.now        || function () { return Date.now(); };
    const setTimer   = deps.setTimer   || function (fn, ms) { return setTimeout(fn, ms); };
    const clearTimer = deps.clearTimer || function (id) { clearTimeout(id); };
    const setLoop    = deps.setLoop    || function (fn, ms) { return setInterval(fn, ms); };
    const isOnline   = deps.isOnline   || function () { return (typeof navigator === "undefined") ? true : navigator.onLine; };
    const onOnline   = deps.onOnline   || function (cb) { if (typeof window !== "undefined") window.addEventListener("online", cb); };
    const onOffline  = deps.onOffline  || function (cb) { if (typeof window !== "undefined") window.addEventListener("offline", cb); };
    const uid        = deps.uid        || defaultUid;
    const debounceMs = (opts.debounceMs === undefined) ? DEBOUNCE_MS : opts.debounceMs;
    const retryMs    = (opts.retryMs === undefined) ? RETRY_MS : opts.retryMs;
    const readyFn    = opts.ready || null;      // e.g. () => gapi client initialised

    const KEY = "nd.queue." + opts.name + ".v1";

    const handlers = Object.create(null);
    let status = "synced";
    let statusListeners = [];
    let debounceTimer = null;
    let loopStarted = false;
    let flushing = false;

    function load() {
      try { return JSON.parse(storage.get(KEY) || "[]"); } catch (e) { return []; }
    }
    function save(q) { storage.set(KEY, JSON.stringify(q)); }

    function setStatus(s) {
      if (s === status) return;
      status = s;
      statusListeners.forEach(function (cb) { try { cb(s); } catch (e) {} });
    }

    function scheduleFlush() {
      if (debounceTimer !== null) clearTimer(debounceTimer);
      debounceTimer = setTimer(function () { debounceTimer = null; flush(); }, debounceMs);
      if (!loopStarted) { loopStarted = true; setLoop(flush, retryMs); }
    }

    function enqueue(kind, payload, o) {
      o = o || {};
      let q = load();
      if (o.supersede && o.key !== undefined) {
        // Timesheet's delete-drops-pending-writes rule, generalised:
        // remove every queued item carrying the same record key.
        q = q.filter(function (it) { return it.key !== o.key; });
      }
      q.push({ id: uid(), kind: kind, payload: payload, key: (o.key === undefined ? null : o.key), ts: now(), attempts: 0, lastError: null });
      save(q);
      setStatus("pending");
      scheduleFlush();
    }

    async function flush() {
      if (flushing) return;
      if (!isOnline()) { if (load().length) setStatus("pending"); return; }
      if (readyFn && !readyFn()) { if (load().length) setStatus("pending"); return; }
      let q = load();
      if (!q.length) { setStatus("synced"); return; }
      flushing = true;
      setStatus("flushing");
      const remaining = [];
      for (const item of q) {
        const h = handlers[item.kind];
        if (!h) { remaining.push(item); continue; }          // no handler yet — keep waiting
        try {
          await h(item.payload, item);
        } catch (e) {
          item.attempts = (item.attempts || 0) + 1;
          item.lastError = (e && e.message) || String(e);
          remaining.push(item);
        }
      }
      // Merge in anything enqueued while we were flushing
      const during = load().filter(function (it) { return !q.some(function (o2) { return o2.id === it.id; }); });
      const merged = remaining.concat(during);
      save(merged);
      flushing = false;
      setStatus(merged.length ? (during.length && !remaining.length ? "pending" : "failed") : "synced");
      if (during.length) scheduleFlush();
    }

    // wire connectivity
    onOnline(function () { flush(); });
    onOffline(function () { if (load().length) setStatus("pending"); });

    const api = {
      handler: function (kind, fn) { handlers[kind] = fn; return api; },
      enqueue: enqueue,
      flush: flush,
      pending: function () { return load().map(function (it) { return Object.assign({}, it); }); },
      size: function () { return load().length; },
      status: function () { return status; },
      onStatus: function (cb) { statusListeners.push(cb); return function () { statusListeners = statusListeners.filter(function (l) { return l !== cb; }); }; },
      clear: function () { save([]); setStatus("synced"); },   // danger-zone only
      _key: KEY
    };
    return api;
  }

  function defaultStorage() {
    return {
      get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    };
  }

  const API = { DEBOUNCE_MS, RETRY_MS, createQueue };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
  } else {
    root.ND = root.ND || {};
    root.ND.queueKit = API;
    /* Apps create their own namespaced queue and (by convention) publish it:
     *   window.NDQueue = ND.queueKit.createQueue({ name: "planner", ready: ... });
     * The sync chip (§1.6) reads window.NDQueue.                        */
  }
})(typeof window !== "undefined" ? window : globalThis);
