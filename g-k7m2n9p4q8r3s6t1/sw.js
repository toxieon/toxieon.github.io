const CACHE_VERSION = 'gatecodes-0.1.3';
const SHELL_ASSETS = [
  "./",
  "../shared/nd-backend.js",
  "../shared/nd-config.js",
  "../shared/nd-auth.js",
  "../shared/nd-gate-codes.js?v=0.1.3",
  "../shared/nd-site-match.js?v=0.1.3",
  "../shared/nd-core.css",
  "../shared/nd-ui.js",
  "./index.html",
  "./app.js?v=0.1.3",
  "./manifest.json",
  "./favicon.svg",
  "./icons/icon-32.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png"
];

const IS_API_HOST = (url) =>
  /\b(googleapis\.com|accounts\.google\.com|google\.com\/macros)\b/.test(url);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.all(
        SHELL_ASSETS.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gatecodes-') && k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = req.url;
  if (req.method !== 'GET') return;
  if (IS_API_HOST(url)) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }
  if (new URL(url).origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const net = fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          return res;
        });
        return cached || net;
      })
    );
  }
});
