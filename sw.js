/* RPM Sales PWA fix: cache version must change on new deployments */
'use strict';
const CACHE_NAME = 'rpm-sales-20261102-icons-v2';
const ROOT = self.registration.scope;
const REQUIRED = [
  'index.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // If an essential file was not uploaded, installation of this worker fails.
    // This prevents a misleading "worker OK" state with broken icons.
    await cache.addAll(REQUIRED.map(x => new URL(x, ROOT).href));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(x =>
      (x.startsWith('rpm-sales-') || x.startsWith('salespulse-rpm1-')) && x !== CACHE_NAME
    ).map(x => caches.delete(x)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(ROOT).pathname)) return;
  const isDocument = req.mode === 'navigate';
  const isManifest = url.pathname.endsWith('/manifest.webmanifest');
  if (isDocument || isManifest) {
    // Keep the app/manifest fresh while retaining an offline fallback.
    event.respondWith((async () => {
      try {
        const response = await fetch(req, {cache:'no-store'});
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(isDocument ? new URL('index.html', ROOT) : new URL('manifest.webmanifest', ROOT), response.clone());
          return response;
        }
      } catch (_) {}
      return (await caches.match(isDocument ? new URL('index.html', ROOT) : new URL('manifest.webmanifest', ROOT))) || Response.error();
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(req, {ignoreSearch:true});
    if (cached) return cached;
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(req, res.clone());
    }
    return res;
  })());
});
