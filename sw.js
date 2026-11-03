/* SalesPulse RPM week isolation 3.0 - network-first with offline cache fallback. */
'use strict';
const CACHE = 'salespulse-rpm-week-isolation-v3-20261103';
const SHELL = [
  './', './index.html', './style.css', './cloud-sync.css', './app.js',
  './cloud-sync.js', './firebase-config.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];
self.addEventListener('install', event => {
  // Do not block installation if an optional image is temporarily unavailable.
  event.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k =>
    (k.startsWith('salespulse-') || k.startsWith('rpm-sales-')) && k !== CACHE
  ).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url),scope=new URL(self.registration.scope);
  if(url.origin!==scope.origin || !url.pathname.startsWith(scope.pathname))return;
  event.respondWith(fetch(req).then(res => {
    if(res.ok){const clone=res.clone();event.waitUntil(caches.open(CACHE).then(c => c.put(req,clone)).catch(()=>{}));}
    return res;
  }).catch(async()=>{
    const cached=await caches.match(req,{ignoreSearch:true});
    if(cached)return cached;
    if(req.mode==='navigate')return await caches.match('./index.html') || new Response('Offline, halaman belum tersimpan.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    return Response.error();
  }));
});
