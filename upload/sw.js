/* Service worker — app-shell caching for offline use.
 * Generated from the suite PWA kit (shared, §1.8), which follows
 * Timesheet's proven sw.js pattern: shell cached, Google APIs network-only
 * (nd-queue owns write resilience, not this cache).
 */

const CACHE_VERSION = 'upload-v1';
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./favicon.svg",
  "./styles.css",
  "../shared/nd-config.js",
  "../shared/nd-auth.js",
  "./app.js"
];

const IS_API_HOST = (url) =>
  /\b(googleapis\.com|accounts\.google\.com|google\.com\/macros)\b/.test(url);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;    // writes belong to nd-queue, never the cache
  if (IS_API_HOST(req.url)) return;    // Sheets/Drive/Maps/OAuth always hit the network

  event.respondWith(
    caches.match(req, { ignoreSearch: false }).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res.ok && new URL(req.url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        });
    })
  );
});
