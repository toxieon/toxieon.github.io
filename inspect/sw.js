/* Offline shell for Neill Inspect. */
const CACHE_VERSION = 'inspect-0.1.3';
const SHELL_ASSETS = [
  './',
  './index.html',
  './app.js?v=0.1.3',
  './logic.js?v=0.1.3',
  './pdf.js?v=0.1.3',
  '../assets/here.js',
  './manifest.json',
  './favicon.svg',
  '../shared/vendor/jspdf/jspdf.umd.min.js',
  '../shared/nd-pwa.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.all(SHELL_ASSETS.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('inspect-') && k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }
  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) => cache.match(req).then((cached) => {
      const refresh = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || refresh;
    }))
  );
});
