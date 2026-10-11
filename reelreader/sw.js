const CACHE_VERSION = "reelreader-0.1.2";
const CACHE_PREFIX = "reelreader-";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=0.1.2",
  "./app.js?v=0.1.2",
  "./config.js?v=0.1.2",
  "./manifest.json",
  "./favicon.svg",
  "../assets/suite-icons/apps/hub-180.png",
  "../assets/suite-icons/apps/hub-192.png",
  "../assets/suite-icons/apps/hub-512.png",
  "../shared/nd-core.css",
  "../shared/nd-ui.js",
  "../shared/nd-pwa.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.all(
        SHELL_ASSETS.map((asset) => cache.add(new Request(asset, { cache: "reload" })).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return response;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.match(req).then((cached) => {
        const refresh = fetch(req)
          .then((response) => {
            if (response.ok) cache.put(req, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || refresh;
      })
    )
  );
});
