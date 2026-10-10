/* Service worker — Assets showroom + visual library (offline shell). */

const CACHE_VERSION = "assets-1.2.1";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./visual/index.html",
  "./visual/visual.css?v=1.2.1",
  "./visual/visual.js?v=1.2.1",
  "./visual-catalog.json",
  "../assets/suite-icons/apps/assets.svg?v=1.2.0",
  "../shared/nd-core.css",
  "../shared/nd-pwa.js",
];

const IS_API_HOST = (url) =>
  /\b(googleapis\.com|accounts\.google\.com|google\.com\/macros)\b/.test(url);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(
        SHELL_ASSETS.map((u) =>
          cache.add(new Request(u, { cache: "reload" })).catch(() => null)
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("assets-") && k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (IS_API_HOST(req.url)) return;

  const sameOrigin = new URL(req.url).origin === self.location.origin;
  if (!sameOrigin) return;

  const accept = req.headers.get("accept") || "";
  const isNav = req.mode === "navigate" || (accept.includes("text/html") && req.url.endsWith("/"));

  if (isNav) {
    event.respondWith(
      fetch(req, { cache: "no-cache" })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      });
      return cached || network;
    })
  );
});
