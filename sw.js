const CACHE_NAME = 'cronoflex-v56';
const ASSETS = ['./', './index.html', './app.js', './calculator.js', './seed.js', './sync_data.json', './firebase-sync.js', './guida_regole.html', './modello_dirigenza.xlsx', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => Promise.all(ASSETS.map(a => c.add(new Request(a, { cache: 'reload' })).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE_NAME).map(x => caches.delete(x)))));
  self.clients.claim();
});
// Prima la rete (usando URL stringa per evitare TypeError su Request con mode='navigate'), cache solo se offline.
// Esclude sempre le chiamate dinamiche Firebase/Google OAuth e Firestore real-time.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = e.request.url;
  if (
    u.includes('googleapis.com') ||
    u.includes('firebaseio.com') ||
    u.includes('firebaseapp.com/__/') ||
    u.includes('accounts.google.com') ||
    u.includes('identitytoolkit') ||
    u.includes('securetoken')
  ) return;
  const isSameOrigin = u.startsWith(self.location.origin);
  const netFetch = isSameOrigin ? fetch(u, { cache: 'no-cache' }) : fetch(e.request);
  e.respondWith(
    netFetch.then(r => {
      if (r && r.ok) {
        const c = r.clone();
        caches.open(CACHE_NAME).then(x => x.put(e.request, c));
      }
      return r;
    }).catch(() => caches.match(e.request))
  );
});
// Tocco sulla notifica: apre/porta in primo piano l'app (e il report, se indicato)
self.addEventListener('notificationclick', e => {
  e.notification.close(); const dati = e.notification.data || '';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => {
    for (const c of l) if ('focus' in c) { c.postMessage({ open: dati }); return c.focus(); }
    return clients.openWindow('./index.html' + dati);
  }));
});
