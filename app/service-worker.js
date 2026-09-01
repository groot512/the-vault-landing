const CACHE_NAME = 'the-vault-app-v3';
const APP_SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './config.js',
  './identity.js',
  './recovery.js',
  './pwa.js',
  './manifest.webmanifest',
  './icons/vault-icon-192.png',
  './icons/vault-icon-512.png',
  '../navigation.css',
  '../navigation.js',
  '../i18n.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(APP_SHELL.map((asset) => cache.add(asset)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;

  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok && requestUrl.pathname.includes('/app/')) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html'))));
});
