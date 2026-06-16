/* Service worker — app-shell caching for offline use (spec section 7 / 9).
 * The whole app is now a single self-contained index.html, so the shell is
 * just that file plus the PWA manifest/icons. Google Sheets/Drive/Maps API
 * calls are network-only and never intercepted: the offline write-queue
 * inside index.html is what makes those resilient, not the cache here. */

const CACHE_VERSION = 'timesheet-v2';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/nd-logo.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
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
  if (req.method !== 'GET') return; // never cache writes; let queueSheetWrite/offline.js own those
  if (IS_API_HOST(req.url)) return; // Sheets/Drive/Maps/OAuth always go to the network

  event.respondWith(
    caches.match(req).then((cached) => {
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
          // Offline and not cached — fall back to the shell for navigations
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const existing = clients.find((c) => c.url.includes('index.html'));
      if (existing) return existing.focus();
      return self.clients.openWindow('./index.html');
    })
  );
});
