const CACHE_NAME = 'the-vault-app-v9';
const PUSH_CACHE = 'the-vault-push-state-v1';
const PUSH_BINDING = new URL('./__push_binding__', self.registration.scope).href;
const APP_SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './config.js',
  './identity.js',
  './recovery.js',
  './pwa.js',
  './notifications.js',
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
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('the-vault-app-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const readPushBinding = async () => {
  const response = await (await caches.open(PUSH_CACHE)).match(PUSH_BINDING);
  return response ? response.json() : null;
};
const clearAlerts = async () => {
  const notifications = await self.registration.getNotifications({ tag: 'tessera-messages' });
  notifications.forEach((notification) => notification.close());
  try { await self.navigator.clearAppBadge?.(); } catch { /* Badge denial must not prevent logout. */ }
};
self.addEventListener('message', (event) => {
  if (!event.source?.url?.startsWith(self.registration.scope)) return;
  if (event.data?.type === 'VAULT_PUSH_BIND') {
    event.waitUntil((async () => {
      const cache = await caches.open(PUSH_CACHE);
      const id = event.data.subscriptionId;
      if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) {
        await cache.put(PUSH_BINDING, new Response(JSON.stringify({ id })));
      } else {
        await cache.delete(PUSH_BINDING);
        await clearAlerts();
      }
      event.ports[0]?.postMessage({ ok: true });
    })().catch(() => event.ports[0]?.postMessage({ ok: false })));
  }
  if (event.data?.type === 'VAULT_PUSH_READ') {
    event.waitUntil((async () => {
      const saved = await readPushBinding();
      if (saved && saved.id === event.data.subscriptionId) await clearAlerts();
    })());
  }
});
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    const saved = await readPushBinding();
    if (!saved || payload?.v !== 1 || payload.subscriptionId !== saved.id) return;
    const count = Math.min(9999, Math.max(0, Math.floor(Number(payload.unreadCount) || 0)));
    if (!count) return;
    // Never accept server-supplied title, body, link, sender, or message text.
    await self.registration.showNotification('테세라', {
      body: '새 메시지가 도착했습니다. 앱에서 확인하세요.',
      icon: new URL('./icons/vault-icon-192.png', self.registration.scope).href,
      tag: 'tessera-messages',
      renotify: true,
      data: { subscriptionId: saved.id },
    });
    try { await self.navigator.setAppBadge?.(count); } catch { /* Unsupported OS. */ }
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const saved = await readPushBinding();
    if (!saved || saved.id !== event.notification.data?.subscriptionId) return;
    const url = new URL('./#signal', self.registration.scope).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.registration.scope));
    if (existing) {
      existing.postMessage({ type: 'VAULT_PUSH_OPEN' });
      await existing.focus();
    } else await self.clients.openWindow(url);
  })());
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
