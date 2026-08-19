/* Service worker — offline app shell for the Install Checklist (Neill Data suite).
 *
 * Strategy (mirrors the rest of the suite):
 *   - navigations (HTML): network-first, cache fallback when offline — so a
 *     deploy lands on the next load instead of freezing
 *   - same-origin assets (icons/manifest): stale-while-revalidate
 *   - Google Apps Script login + CDN libs: network-only / browser default,
 *     never frozen into the cache
 *   - install precaches with {cache:'reload'} to bypass the HTTP cache
 */

const CACHE_VERSION = 'checklist-v1';
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
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
  if (req.method !== 'GET') return;    // login POSTs always hit the network
  if (IS_API_HOST(req.url)) return;    // Apps Script login: network-only
  if (new URL(req.url).origin !== self.location.origin) return; // pdf.js / xlsx CDN: browser default

  if (req.mode === 'navigate') {
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
