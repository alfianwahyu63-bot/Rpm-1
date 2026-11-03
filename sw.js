/* SalesPulse RPM — PWA Cloudflare/GitHub compatible. Does not touch Firestore or local sales data. */
'use strict';
const APP_CACHE = 'salespulse-rpm-pwa-v6-20261103';
const APP_FILES = [
  './index.html', './manifest.webmanifest',
  './icon-192.png','./icon-512.png','./icon-maskable-512.png',
  './apple-touch-icon.png'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const c = await caches.open(APP_CACHE);
    // Cache each file independently, so one optional file can't block SW installation.
    await Promise.allSettled(APP_FILES.map(async path => {
      const url = new URL(path, self.registration.scope);
      const response = await fetch(url, {cache:'reload'});
      if (response.ok) await c.put(url, response);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(name =>
      (name.startsWith('salespulse-rpm-') || name.startsWith('rpm-sales-')) && name !== APP_CACHE
    ).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if(request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith((async () => {
    try {
      const fresh = await fetch(request);
      if (fresh.ok && (request.mode === 'navigate' || /\.(html|css|js|webmanifest|png)$/i.test(url.pathname))) {
        const cache = await caches.open(APP_CACHE);
        await cache.put(request, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const hit = await caches.match(request,{ignoreSearch:true});
      if(hit) return hit;
      if(request.mode === 'navigate') {
        const root = new URL('./index.html',self.registration.scope);
        const fallback = await caches.match(root);
        if(fallback) return fallback;
      }
      return new Response('Koneksi sedang tidak tersedia.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});
