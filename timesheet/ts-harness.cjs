/* Test-only harness: runs timesheet/index.html's inline app script in a Node
 * vm with minimal DOM stubs, so pure app paths (e.g. the text export) can be
 * exercised against seeded state. Not loaded by the app. */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function stubEl() {
  const fn = function () { return el; };
  const el = new Proxy(fn, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => "";
      if (k === "style" || k === "dataset") return {};
      if (k === "classList") return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (k === "querySelectorAll" || k === "getElementsByTagName") return () => [];
      if (k === "textContent" || k === "innerHTML" || k === "value") return "";
      if (k === "then") return undefined;
      return el;
    },
    set() { return true; },
    apply() { return el; },
  });
  return el;
}

function loadApp(seedState, extra = {}) {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script>\n([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const main = scripts.sort((a, b) => b.length - a.length)[0];
  const store = new Map(Object.entries({ ts_state_v1: JSON.stringify(seedState) }));
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const document = new Proxy({}, { get(t, k) {
    if (k === "addEventListener" || k === "removeEventListener" || k === "dispatchEvent") return () => {};
    if (k === "querySelectorAll") return () => [];
    if (k === "getElementById" || k === "querySelector") return () => null;
    if (k === "createElement") return () => stubEl();
    if (k === "body" || k === "documentElement" || k === "head") return stubEl();
    if (k === "hidden") return false;
    if (k === "readyState") return "loading";
    return undefined;
  } });
  const ctx = {
    console, Math, Date, JSON, Promise, Map, Set, URL, URLSearchParams, Intl, Number, String, Array, Object, Error, RegExp, Symbol, encodeURIComponent, decodeURIComponent, isFinite, parseFloat, parseInt,
    document, localStorage, sessionStorage: localStorage,
    navigator: { onLine: false, userAgent: "node" }, location: { href: "https://www.neilldata.com/timesheet/", hash: "", search: "", pathname: "/timesheet/", origin: "https://www.neilldata.com" },
    history: { replaceState() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    fetch: () => Promise.reject(new Error("offline")), Event: class {}, CustomEvent: class {}, MutationObserver: class { observe() {} },
    Blob: class {}, ...extra,
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ["ts-time.js", "ts-map.js"]) { const p = path.join(__dirname, f); if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: f }); }
  vm.runInContext(main, ctx, { filename: "timesheet-inline.js" });
  return ctx;
}
module.exports = { loadApp };
