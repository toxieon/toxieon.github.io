/* =========================================================================
 *  nd-cache.js — Neill Data Suite stale-while-revalidate cache (§1.2)
 *
 *  IndexedDB-backed (NOT localStorage — Planner floor plans blow localStorage
 *  up; IDB stores Blobs natively, which §2.3 relies on).
 *
 *  API (browser singleton NDCache):
 *    NDCache.get(key)                     -> Promise<value | undefined>
 *    NDCache.getEntry(key)                -> Promise<{value,meta,storedAt} | undefined>
 *    NDCache.put(key, value, meta)        -> Promise<void>
 *    NDCache.remove(key) / NDCache.keys() / NDCache.clear()
 *    NDCache.swr(key, fetcher, {maxAge})  -> Promise<value>
 *        cached present  -> resolves cached IMMEDIATELY; if older than
 *                           maxAge, kicks a background refresh and emits
 *                           {type:'update', key, value} when fresh lands.
 *        cache miss      -> awaits fetcher, stores, resolves fresh.
 *    NDCache.onUpdate(cb)                 -> unsubscribe fn. Events:
 *        {type:'update', key, value}  fresh data landed after a stale hit
 *        {type:'error',  key, error}  background refresh failed (cache kept)
 *
 *  Boot pattern everywhere: skeleton -> cached (instant) -> silent refresh
 *  -> quiet UI update on 'update'.
 *
 *  Node-testable: createCache(adapter, deps) with any async {get,set,remove,
 *  keys,clear} adapter.  Run:  node shared/nd-cache.test.js
 * ========================================================================= */
(function (root) {
  "use strict";

  const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

  /* ── core factory ─────────────────────────────────────────────────── */
  function createCache(adapter, deps) {
    deps = deps || {};
    const now = deps.now || function () { return Date.now(); };
    let listeners = [];
    const inflight = Object.create(null);   // key -> Promise (dedupes refreshes)

    function emit(ev) {
      listeners.forEach(function (cb) { try { cb(ev); } catch (e) {} });
    }

    function put(key, value, meta) {
      return Promise.resolve(adapter.set(key, { value: value, meta: meta || null, storedAt: now() }));
    }

    function getEntry(key) {
      return Promise.resolve(adapter.get(key)).then(function (e) {
        return (e && typeof e === "object" && "value" in e) ? e : undefined;
      });
    }

    function get(key) {
      return getEntry(key).then(function (e) { return e ? e.value : undefined; });
    }

    function refresh(key, fetcher, meta) {
      if (inflight[key]) return inflight[key];
      inflight[key] = Promise.resolve()
        .then(fetcher)
        .then(function (value) {
          return put(key, value, meta).then(function () {
            emit({ type: "update", key: key, value: value });
            return value;
          });
        })
        .catch(function (err) {
          emit({ type: "error", key: key, error: err });
          throw err;
        })
        .finally(function () { delete inflight[key]; });
      return inflight[key];
    }

    function swr(key, fetcher, opts) {
      opts = opts || {};
      const maxAge = (opts.maxAge === undefined) ? DEFAULT_MAX_AGE_MS : opts.maxAge;
      return getEntry(key).then(function (entry) {
        if (entry !== undefined) {
          const age = now() - (entry.storedAt || 0);
          if (age > maxAge) refresh(key, fetcher, opts.meta).catch(function () {}); // background; errors via 'error' event
          return entry.value;                                                       // instant
        }
        return refresh(key, fetcher, opts.meta);                                    // cold: caller waits once
      });
    }

    return {
      get: get,
      getEntry: getEntry,
      put: put,
      swr: swr,
      refresh: refresh,          // force a fetch->store->emit cycle (pull-to-refresh)
      remove: function (key) { return Promise.resolve(adapter.remove(key)); },
      keys: function () { return Promise.resolve(adapter.keys()); },
      clear: function () { return Promise.resolve(adapter.clear()); },
      onUpdate: function (cb) {
        listeners.push(cb);
        return function () { listeners = listeners.filter(function (l) { return l !== cb; }); };
      },
      pendingRefreshes: function () { return Object.keys(inflight); }
    };
  }

  /* ── IndexedDB adapter (browser) ──────────────────────────────────── */
  function idbAdapter(dbName, storeName) {
    dbName = dbName || "nd-cache";
    storeName = storeName || "kv";
    let dbp = null;
    function open() {
      if (!dbp) dbp = new Promise(function (res, rej) {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(storeName); };
        req.onsuccess = function () { res(req.result); };
        req.onerror = function () { rej(req.error); };
      });
      return dbp;
    }
    function tx(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (res, rej) {
          const t = db.transaction(storeName, mode);
          const req = fn(t.objectStore(storeName));
          t.oncomplete = function () { res(req && req.result); };
          t.onerror = function () { rej(t.error); };
          t.onabort = function () { rej(t.error); };
        });
      });
    }
    return {
      get:    function (k)    { return tx("readonly",  function (s) { return s.get(k); }); },
      set:    function (k, v) { return tx("readwrite", function (s) { return s.put(v, k); }); },
      remove: function (k)    { return tx("readwrite", function (s) { return s.delete(k); }); },
      keys:   function ()     { return tx("readonly",  function (s) { return s.getAllKeys(); }); },
      clear:  function ()     { return tx("readwrite", function (s) { return s.clear(); }); }
    };
  }

  /* ── in-memory adapter (tests, or IDB-less environments) ──────────── */
  function memoryAdapter() {
    const m = new Map();
    return {
      get:    function (k)    { return m.get(k); },
      set:    function (k, v) { m.set(k, v); },
      remove: function (k)    { m.delete(k); },
      keys:   function ()     { return Array.from(m.keys()); },
      clear:  function ()     { m.clear(); },
      _map: m
    };
  }

  const API = { DEFAULT_MAX_AGE_MS, createCache, idbAdapter, memoryAdapter };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
  } else {
    root.ND = root.ND || {};
    root.ND.cacheKit = API;
    root.NDCache = createCache(
      (typeof indexedDB !== "undefined") ? idbAdapter() : memoryAdapter()
    );
  }
})(typeof window !== "undefined" ? window : globalThis);
