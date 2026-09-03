import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const code = fs.readFileSync(new URL('../app/notifications.js', import.meta.url), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function harness({ permission = 'granted', enabled = true, failRemove = false, saved = null } = {}) {
  const nodes = new Map();
  const node = () => ({ hidden: false, textContent: '', listeners: {}, attributes: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute(key, value) { this.attributes[key] = value; },
    appendChild(child) { this.child = child; }, click() {},
  });
  for (const name of ['[data-push-toggle]', '[data-push-label]', '[data-push-status]']) nodes.set(name, node());
  const nav = node();
  const listeners = {};
  const storage = new Map(saved ? [['vault.push.binding.v1', JSON.stringify(saved)]] : []);
  const events = [];
  let requests = 0;
  let sub = saved ? { unsubscribe: async () => { sub = null; return true; }, toJSON: () => ({ endpoint: 'test' }) } : null;
  const worker = { postMessage: (data, ports) => { events.push(data); ports?.[0]?.reply(); } };
  const registration = { active: worker, pushManager: {
    getSubscription: async () => sub,
    subscribe: async () => {
      sub = { toJSON: () => ({ endpoint: 'test' }), unsubscribe: async () => { sub = null; return true; } }; return sub;
    },
  } };
  const window = {
    isSecureContext: true, PushManager: function() {}, Notification: {}, location: {},
    addEventListener: (name, fn) => { listeners[name] = fn; },
    vaultIdentity: {
      pushConfig: async () => ({ enabled, publicKey: 'A'.repeat(87) }),
      registerPush: async () => { events.push('register'); return '12345678-1234-4234-8234-123456789012'; },
      removePush: async () => { events.push('remove'); if (failRemove) throw new Error('offline'); },
    },
  };
  const document = { title: 'VAULT', querySelector: (key) => nodes.get(key), querySelectorAll: () => [nav], createElement: node };
  vm.runInNewContext(code, { window, document,
    navigator: { serviceWorker: { ready: Promise.resolve(registration), addEventListener() {} }, setAppBadge: async () => {}, clearAppBadge: async () => {} },
    Notification: { permission, requestPermission: async () => { requests++; return permission; } },
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key,value), removeItem: (key) => storage.delete(key) },
    atob, Uint8Array, setTimeout: () => 0, clearTimeout() {},
    MessageChannel: class { constructor() { this.port1 = { close() {} }; this.port2 = { reply: () => this.port1.onmessage({data:{ok:true}}) }; } },
  });
  return { window, document, nodes, nav, events, storage, requests: () => requests,
    initialize: async () => { listeners['vault:identity-ready']({ detail: { mode: 'SUPABASE', userId: 'user', device: {id:'device'} } }); await tick(); },
    click: () => nodes.get('[data-push-toggle]').listeners.click(),
  };
}
test('no permission prompt on startup; explicit enable persists binding; unread/reset works', async () => {
  const h = harness(); await h.initialize();
  assert.equal(h.requests(),0);
  await h.click();
  assert.equal(h.requests(),1);
  assert.equal(h.nodes.get('[data-push-toggle]').attributes['aria-pressed'],'true');
  h.window.vaultNotifications.setUnread(120);
  assert.equal(h.nav.child.textContent,'99+');
  assert.equal(h.document.title,'(99+) VAULT');
  await h.window.vaultNotifications.disable();
  assert.equal(h.document.title,'VAULT');
  assert.equal(h.storage.size,0);
  assert.ok(h.events.includes('remove'));
});
test('denied permission never creates a subscription', async () => {
  const h = harness({ permission:'denied' }); await h.initialize(); await h.click();
  assert.ok(!h.events.includes('register'));
  assert.ok(h.nodes.get('[data-push-status]').textContent.includes('차단'));
});
test('server unconfigured is disabled; unsubscribe failure is not reported as success', async () => {
  const unconfigured = harness({ enabled:false }); await unconfigured.initialize();
  assert.equal(unconfigured.nodes.get('[data-push-toggle]').disabled,true);
  const h = harness({ failRemove:true }); await h.initialize(); await h.click();
  await assert.rejects(h.window.vaultNotifications.disable());
  assert.equal(h.storage.size,1);
});
test('other account binding discarded and requires opt-in again', async () => {
  const h = harness({ saved: {id:'old',userId:'other-user',deviceId:'other-device'} }); await h.initialize();
  assert.equal(h.storage.size,0);
  assert.equal(h.nodes.get('[data-push-toggle]').attributes['aria-pressed'],'false');
  assert.ok(!h.events.includes('register'));
  assert.ok(h.events.some((event) => event.type === 'VAULT_PUSH_BIND' && event.subscriptionId === null));
});
