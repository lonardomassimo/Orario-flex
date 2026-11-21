const CACHE_NAME = 'cronoflex-v6';
const ASSETS = ['./', './index.html', './app.js', './calculator.js', './seed.js', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE_NAME).map(x => caches.delete(x)))));
  self.clients.claim();
});
// Prima la rete (versione sempre aggiornata), cache solo se sei offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE_NAME).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
// Tocco sulla notifica: apre/porta in primo piano l'app (e il report, se indicato)
self.addEventListener('notificationclick', e => {
  e.notification.close(); const dati = e.notification.data || '';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => {
    for (const c of l) if ('focus' in c) { c.postMessage({ open: dati }); return c.focus(); }
    return clients.openWindow('./index.html' + dati);
  }));
});
