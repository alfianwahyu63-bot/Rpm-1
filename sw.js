/* SalesPulse RPM - app-shell PWA using Klerek-Kasir relative-path pattern. */
'use strict';
const CACHE = 'salespulse-rpm-cloudsync-v2-isolasi-minggu-20261103';
const SHELL = [
  './', './index.html', './style.css', './cloud-sync.css', './app.js', './cloud-sync.js', './firebase-config.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k =>
    (k.startsWith('salespulse-') || k.startsWith('rpm-sales-')) && k !== CACHE
  ).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const u = new URL(event.request.url);
  if(u.origin !== self.location.origin || !u.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  // Firebase configuration must be fresh after admin edits it on GitHub.
  if(u.pathname.endsWith('/firebase-config.js')) {
    event.respondWith(fetch(event.request).then(res=>{
      if(res.ok)caches.open(CACHE).then(c=>c.put(event.request,res.clone())).catch(()=>{});
      return res;
    }).catch(()=>caches.match(event.request)));
    return;
  }
  if(event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(r => {
      if(r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html',copy)).catch(() => {}); }
      return r;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(r => r || fetch(event.request).then(res => {
    if(res.ok) caches.open(CACHE).then(c => c.put(event.request,res.clone())).catch(() => {});
    return res;
  })));
});
