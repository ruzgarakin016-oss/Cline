// Uygulama dosyalarını önbelleğe alır: internet olmadan da açılır (çevrimdışı modda çalışır).
const CACHE = 'sinifim-v1';
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/app.js', './js/face.js', './js/teachers.js', './js/storage.js', './js/ai.js',
  './js/offline.js', './js/speech.js', './js/classroom.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Önce ağ, olmazsa önbellek: güncellemeler hemen gelsin.
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
