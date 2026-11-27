/* Offline shell — owner stats UI only (live fetch when online). */
const CACHE_VERSION = "models-0.5.0";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./handoff.js?v=0.5.0",
  "./styles.css?v=0.5.0",
  "./config.js?v=0.5.0",
  "./api.js?v=0.5.0",
  "./normalise.js?v=0.5.0",
  "./calendar.js?v=0.5.0",
  "./dates.js?v=0.5.0",
  "./format.js?v=0.5.0",
  "./bestpick.js?v=0.5.0",
  "./hybrid.js?v=0.5.0",
  "./demo.js?v=0.5.0",
  "./app.js?v=0.5.0",
  "./manifest.json",
  "./favicon.svg",
  "../shared/nd-pwa.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        Promise.all(SHELL_ASSETS.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => null)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("models-") && k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const clone = res.clone();
      caches.open(CACHE_VERSION).then((c) => c.put(req, clone)).catch(() => null);
      return res;
    }))
  );
});