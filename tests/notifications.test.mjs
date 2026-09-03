import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const code = fs.readFileSync(new URL('../app/service-worker.js', import.meta.url), 'utf8');
function harness() {
  const handlers = {};
  const stored = new Map();
  const notices = [];
  const opened = [];
  let badge = 0;
  const cache = {
    match: async (key) => stored.has(key) ? new Response(stored.get(key)) : undefined,
    put: async (key, response) => stored.set(key, await response.text()),
    delete: async (key) => stored.delete(key),
  };
  const scope = 'https://app.thevault73.com/app/';
  vm.runInNewContext(code, {
    URL, Response, console,
    caches: { open: async () => cache },
    self: {
      registration: {
        scope,
        showNotification: async (title, options) => notices.push({ title, ...options }),
        getNotifications: async () => notices.map((item) => ({ close: () => { item.closed = true; } })),
      },
      navigator: { setAppBadge: async (count) => { badge = count; }, clearAppBadge: async () => { badge = 0; } },
      clients: { matchAll: async () => [], openWindow: async (url) => opened.push(url) },
      addEventListener: (type, handler) => { handlers[type] = handler; },
    },
  });
  const fire = async (type, data = {}) => {
    const promises = [];
    handlers[type]({ ...data, waitUntil: (promise) => promises.push(promise) });
    await Promise.all(promises);
  };
  const bind = (id) => fire('message', { source: { url: scope }, data: { type: 'VAULT_PUSH_BIND', subscriptionId: id }, ports: [] });
  const push = (payload) => fire('push', { data: { json: () => payload } });
  return { fire, bind, push, notices, opened, badge: () => badge, scope };
}
const id = '12345678-1234-4234-8234-123456789012';

test('push is generic, ignores arbitrary plaintext/link, applies supported badge', async () => {
  const h = harness();
  await h.bind(id);
  await h.push({ v: 1, subscriptionId: id, unreadCount: 3, body: 'PRIVATE SECRET', url: 'https://evil.example' });
  assert.equal(h.notices.length, 1);
  assert.equal(h.badge(), 3);
  assert.equal(h.notices[0].body, '새 메시지가 도착했습니다. 앱에서 확인하세요.');
  assert.ok(!JSON.stringify(h.notices).includes('PRIVATE SECRET'));
  await h.fire('notificationclick', { notification: { close() {}, data: { subscriptionId: id, url: 'https://evil.example' } } });
  assert.deepEqual(h.opened, [`${h.scope}#signal`]);
});
test('unbound, other-account, read and malformed messages do not notify', async () => {
  const h = harness();
  await h.push({ v: 1, subscriptionId: id, unreadCount: 1 });
  await h.bind(id);
  await h.push({ v: 1, subscriptionId: 'another-account', unreadCount: 1 });
  await h.push({ v: 1, subscriptionId: id, unreadCount: 0 });
  await h.push({ v: 1, subscriptionId: id, unreadCount: 'invalid' });
  await h.fire('push', { data: { json: () => { throw new Error('bad JSON'); } } });
  assert.equal(h.notices.length, 0);
});
test('read closes notifications; logout suppresses already queued pushes and clicks', async () => {
  const h = harness();
  await h.bind(id);
  await h.push({ v: 1, subscriptionId: id, unreadCount: 2 });
  await h.fire('message', { source: { url: h.scope }, data: { type: 'VAULT_PUSH_READ', subscriptionId: id } });
  assert.equal(h.badge(), 0);
  assert.equal(h.notices[0].closed, true);
  await h.bind(null);
  await h.push({ v: 1, subscriptionId: id, unreadCount: 4 });
  await h.fire('notificationclick', { notification: { close() {}, data: { subscriptionId: id } } });
  assert.equal(h.notices.length, 1);
  assert.equal(h.opened.length, 0);
});
test('out-of-scope pages cannot bind a worker; huge counts are bounded', async () => {
  const h = harness();
  await h.fire('message', { source: { url: 'https://evil.example/app/' }, data: { type: 'VAULT_PUSH_BIND', subscriptionId: id }, ports: [] });
  await h.push({ v: 1, subscriptionId: id, unreadCount: 1 });
  assert.equal(h.notices.length, 0);
  await h.bind(id);
  await h.push({ v: 1, subscriptionId: id, unreadCount: 9000000 });
  assert.equal(h.badge(), 9999);
});
