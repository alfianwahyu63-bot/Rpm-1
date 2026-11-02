"use strict";
const CACHE = 'salespulse-rpm2-v8-installfix-20261102';
const CORE = ['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    // Jangan gagalkan instalasi SW bila satu aset opsional sementara gagal.
    const results = await Promise.allSettled(CORE.map(url=>cache.add(url)));
    if(results[1].status === 'rejected') throw results[1].reason;
  }).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys
    .filter(key=>key.startsWith('salespulse-') && key !== CACHE)
    .map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method !== 'GET' || new URL(request.url).origin !== self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok && new URL(request.url).pathname.endsWith('/')){
        const copy=response.clone();caches.open(CACHE).then(c=>c.put('./',copy));
      }
      return response;
    }).catch(async()=>await caches.match(request) || await caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached || fetch(request).then(response=>{
    if(response.ok){ const copy=response.clone();caches.open(CACHE).then(c=>c.put(request,copy)); }
    return response;
  })));
});
