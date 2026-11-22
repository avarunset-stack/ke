/* Caches only the thin shell (icons, manifest, page). The app itself loads live from Apps Script.
   Bump VERSION if you change the shell files. */
const VERSION = 'v1';
const CACHE = 'shell-' + VERSION;
const SHELL = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
});
