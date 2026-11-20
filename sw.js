const CACHE_NAME = 'agesp-flex-v5';
const ASSETS = ['./', './index.html', './app.js', './calculator.js', './seed.js', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  // Ogni file è messo in cache separatamente: un file mancante non blocca più l'aggiornamento
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
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE_NAME).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});
