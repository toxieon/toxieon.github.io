/* Service worker — offline app shell for the Neill Data suite (§1.8).
 *
 * Strategy (v2 — fixes the frozen-deploy bug):
 *   - navigations (HTML): network-first, cache fallback when offline
 *   - same-origin assets (js/css/img): stale-while-revalidate — served from
 *     cache instantly, refreshed in the background, so a deploy lands on
 *     the next load instead of never
 *   - Google APIs (Sheets/Drive/Maps/OAuth): network-only, never cached —
 *     nd-queue owns write resilience, not this cache
 *   - install precaches with {cache:'reload'} to bypass the HTTP cache
 *     (a stale CDN copy must not get frozen into the SW cache)
 */

const CACHE_VERSION = 'swb-v3';
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./favicon.svg",
  "./styles.css?v=2.0.0",
  "../shared/nd-config.js",
  "../shared/nd-auth.js",
  "../shared/nd-ui.js",
  "../shared/nd-core.css",
  "../shared/nd-pwa.js",
  "./swb_engine.js?v=2.0.2",
  "./app.js?v=2.0.2"
];

const IS_API_HOST = (url) =>
  /\b(googleapis\.com|accounts\.google\.com|google\.com\/macros)\b/.test(url);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.all(
        SHELL_ASSETS.map((u) =>
          cache.add(new Request(u, { cache: 'reload' })).catch(() => null)
        )
      ))
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
  if (new URL(req.url).origin !== self.location.origin) return; // CDN etc: browser default

  if (req.mode === 'navigate') {
    // network-first: fresh HTML when online, cached shell when offline
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // stale-while-revalidate for everything else same-origin
  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.match(req).then((cached) => {
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || refresh;
      })
    )
  );
});
